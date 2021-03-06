import MagicString from 'magic-string';
import { isQuote } from '../utils/node-utils';
import { BaseDirective, BaseNode } from '../../interfaces';

/**
 * use:xxx={params}   --->    {...__sveltets_ensureAction(xxx(__sveltets_mapElementTag('ParentNodeName'),(params)))}
 */
export function handleActionDirective(
    htmlx: string,
    str: MagicString,
    attr: BaseDirective,
    parent: BaseNode
): void {
    str.overwrite(attr.start, attr.start + 'use:'.length, '{...__sveltets_ensureAction(');

    if (!attr.expression) {
        str.appendLeft(attr.end, `(__sveltets_mapElementTag('${parent.name}')))}`);
        return;
    }

    str.overwrite(
        attr.start + `use:${attr.name}`.length,
        attr.expression.start,
        `(__sveltets_mapElementTag('${parent.name}'),(`
    );
    str.appendLeft(attr.expression.end, ')))');
    const lastChar = htmlx[attr.end - 1];
    if (isQuote(lastChar)) {
        str.remove(attr.end - 1, attr.end);
    }
}
