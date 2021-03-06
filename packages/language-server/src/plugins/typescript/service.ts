import { dirname, resolve } from 'path';
import ts from 'typescript';
import { Document } from '../../lib/documents';
import { Logger } from '../../logger';
import { getPackageInfo } from '../../importPackage';
import { DocumentSnapshot } from './DocumentSnapshot';
import { createSvelteModuleLoader } from './module-loader';
import { ignoredBuildDirectories, SnapshotManager } from './SnapshotManager';
import { ensureRealSvelteFilePath, findTsConfigPath } from './utils';
import { configLoader } from '../../lib/documents/configLoader';

export interface LanguageServiceContainer {
    readonly tsconfigPath: string;
    readonly compilerOptions: ts.CompilerOptions;
    readonly snapshotManager: SnapshotManager;
    getService(): ts.LanguageService;
    updateSnapshot(documentOrFilePath: Document | string): DocumentSnapshot;
    deleteSnapshot(filePath: string): void;
}

const services = new Map<string, Promise<LanguageServiceContainer>>();

export interface LanguageServiceDocumentContext {
    transformOnTemplateError: boolean;
    createDocument: (fileName: string, content: string) => Document;
}

export async function getLanguageServiceForPath(
    path: string,
    workspaceUris: string[],
    docContext: LanguageServiceDocumentContext
): Promise<ts.LanguageService> {
    return (await getService(path, workspaceUris, docContext)).getService();
}

export async function getLanguageServiceForDocument(
    document: Document,
    workspaceUris: string[],
    docContext: LanguageServiceDocumentContext
): Promise<ts.LanguageService> {
    return getLanguageServiceForPath(document.getFilePath() || '', workspaceUris, docContext);
}

export async function getService(
    path: string,
    workspaceUris: string[],
    docContext: LanguageServiceDocumentContext
) {
    const tsconfigPath = findTsConfigPath(path, workspaceUris);

    let service: LanguageServiceContainer;
    if (services.has(tsconfigPath)) {
        service = await services.get(tsconfigPath)!;
    } else {
        Logger.log('Initialize new ts service at ', tsconfigPath);
        const newService = createLanguageService(tsconfigPath, docContext);
        services.set(tsconfigPath, newService);
        service = await newService;
    }

    return service;
}

async function createLanguageService(
    tsconfigPath: string,
    docContext: LanguageServiceDocumentContext
): Promise<LanguageServiceContainer> {
    const workspacePath = tsconfigPath ? dirname(tsconfigPath) : '';

    const { options: compilerOptions, fileNames: files, raw } = getParsedConfig();
    // raw is the tsconfig merged with extending config
    // see: https://github.com/microsoft/TypeScript/blob/08e4f369fbb2a5f0c30dee973618d65e6f7f09f8/src/compiler/commandLineParser.ts#L2537
    const snapshotManager = new SnapshotManager(files, raw, workspacePath || process.cwd());

    // Load all configs within the tsconfig scope and the one above so that they are all loaded
    // by the time they need to be accessed synchronously by DocumentSnapshots to determine
    // the default language.
    await configLoader.loadConfigs(workspacePath);

    const svelteModuleLoader = createSvelteModuleLoader(getSnapshot, compilerOptions);

    let svelteTsPath: string;
    try {
        // For when svelte2tsx is part of node_modules, for example VS Code extension
        svelteTsPath = dirname(require.resolve('svelte2tsx'));
    } catch (e) {
        // Fall back to dirname, for example for svelte-check
        svelteTsPath = __dirname;
    }
    const svelteTsxFiles = [
        './svelte-shims.d.ts',
        './svelte-jsx.d.ts',
        './svelte-native-jsx.d.ts'
    ].map((f) => ts.sys.resolvePath(resolve(svelteTsPath, f)));

    const host: ts.LanguageServiceHost = {
        getCompilationSettings: () => compilerOptions,
        getScriptFileNames: () =>
            Array.from(
                new Set([
                    ...snapshotManager.getProjectFileNames(),
                    ...snapshotManager.getFileNames(),
                    ...svelteTsxFiles
                ])
            ),
        getScriptVersion: (fileName: string) => getSnapshot(fileName).version.toString(),
        getScriptSnapshot: getSnapshot,
        getCurrentDirectory: () => workspacePath,
        getDefaultLibFileName: ts.getDefaultLibFilePath,
        fileExists: svelteModuleLoader.fileExists,
        readFile: svelteModuleLoader.readFile,
        resolveModuleNames: svelteModuleLoader.resolveModuleNames,
        readDirectory: svelteModuleLoader.readDirectory,
        getDirectories: ts.sys.getDirectories,
        useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
        getScriptKind: (fileName: string) => getSnapshot(fileName).scriptKind
    };
    let languageService = ts.createLanguageService(host);
    const transformationConfig = {
        strictMode: !!compilerOptions.strict,
        transformOnTemplateError: docContext.transformOnTemplateError
    };

    return {
        tsconfigPath,
        compilerOptions,
        getService: () => languageService,
        updateSnapshot,
        deleteSnapshot,
        snapshotManager
    };

    function deleteSnapshot(filePath: string): void {
        svelteModuleLoader.deleteFromModuleCache(filePath);
        snapshotManager.delete(filePath);
    }

    function updateSnapshot(documentOrFilePath: Document | string): DocumentSnapshot {
        return typeof documentOrFilePath === 'string'
            ? updateSnapshotFromFilePath(documentOrFilePath)
            : updateSnapshotFromDocument(documentOrFilePath);
    }

    function updateSnapshotFromDocument(document: Document): DocumentSnapshot {
        const filePath = document.getFilePath() || '';
        const prevSnapshot = snapshotManager.get(filePath);
        if (prevSnapshot?.version === document.version) {
            return prevSnapshot;
        }

        const newSnapshot = DocumentSnapshot.fromDocument(document, transformationConfig);

        snapshotManager.set(filePath, newSnapshot);
        if (prevSnapshot && prevSnapshot.scriptKind !== newSnapshot.scriptKind) {
            // Restart language service as it doesn't handle script kind changes.
            languageService.dispose();
            languageService = ts.createLanguageService(host);
        }

        return newSnapshot;
    }

    function updateSnapshotFromFilePath(filePath: string): DocumentSnapshot {
        const prevSnapshot = snapshotManager.get(filePath);
        if (prevSnapshot) {
            return prevSnapshot;
        }

        const newSnapshot = DocumentSnapshot.fromFilePath(
            filePath,
            docContext.createDocument,
            transformationConfig
        );
        snapshotManager.set(filePath, newSnapshot);
        return newSnapshot;
    }

    function getSnapshot(fileName: string): DocumentSnapshot {
        fileName = ensureRealSvelteFilePath(fileName);

        let doc = snapshotManager.get(fileName);
        if (doc) {
            return doc;
        }

        doc = DocumentSnapshot.fromFilePath(
            fileName,
            docContext.createDocument,
            transformationConfig
        );
        snapshotManager.set(fileName, doc);
        return doc;
    }

    function getParsedConfig() {
        const forcedCompilerOptions: ts.CompilerOptions = {
            allowNonTsExtensions: true,
            target: ts.ScriptTarget.Latest,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            allowJs: true,
            noEmit: true,
            declaration: false,
            skipLibCheck: true,
            // these are needed to handle the results of svelte2tsx preprocessing:
            jsx: ts.JsxEmit.Preserve
        };

        // always let ts parse config to get default compilerOption
        let configJson =
            (tsconfigPath && ts.readConfigFile(tsconfigPath, ts.sys.readFile).config) ||
            getDefaultJsConfig();

        // Only default exclude when no extends for now
        if (!configJson.extends) {
            configJson = Object.assign(
                {
                    exclude: getDefaultExclude()
                },
                configJson
            );
        }

        const parsedConfig = ts.parseJsonConfigFileContent(
            configJson,
            ts.sys,
            workspacePath,
            forcedCompilerOptions,
            tsconfigPath,
            undefined,
            [{ extension: 'svelte', isMixedContent: false, scriptKind: ts.ScriptKind.TSX }]
        );

        const compilerOptions: ts.CompilerOptions = {
            ...parsedConfig.options,
            ...forcedCompilerOptions
        };

        // detect which JSX namespace to use (svelte | svelteNative) if not specified or not compatible
        if (!compilerOptions.jsxFactory || !compilerOptions.jsxFactory.startsWith('svelte')) {
            //default to regular svelte, this causes the usage of the "svelte.JSX" namespace
            compilerOptions.jsxFactory = 'svelte.createElement';

            //override if we detect svelte-native
            if (workspacePath) {
                try {
                    const svelteNativePkgInfo = getPackageInfo('svelte-native', workspacePath);
                    if (svelteNativePkgInfo.path) {
                        compilerOptions.jsxFactory = 'svelteNative.createElement';
                    }
                } catch (e) {
                    //we stay regular svelte
                }
            }
        }

        return {
            ...parsedConfig,
            options: compilerOptions
        };
    }

    /**
     * This should only be used when there's no jsconfig/tsconfig at all
     */
    function getDefaultJsConfig(): {
        compilerOptions: ts.CompilerOptions;
        include: string[];
    } {
        return {
            compilerOptions: {
                maxNodeModuleJsDepth: 2,
                allowSyntheticDefaultImports: true
            },
            // Necessary to not flood the initial files
            // with potentially completely unrelated .ts/.js files:
            include: []
        };
    }

    function getDefaultExclude() {
        return ['node_modules', ...ignoredBuildDirectories];
    }
}
