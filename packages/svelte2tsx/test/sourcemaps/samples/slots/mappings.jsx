///<reference types="svelte" />
<></>;function render() {                                                                                                                             {/**
------------------------------------------------------------------------------------------------------------------------------------------------------ */}
<><slot />                                                                                                                                            {/**
=#             Originless mappings                                                                                                                    
<><slot•/>↲    [generated] line 3                                                                                                                     
  <slot•/>↲                                                                                                                                           
<slot•/>↲      [original] line 1                                                                                                                      
------------------------------------------------------------------------------------------------------------------------------------------------------ */}

<slot name="foo">fallback</slot>
                                                                                                                                                      {/**
------------------------------------------------------------------------------------------------------------------------------------------------------ */}
<slot foo={foo} name="bar" baz={baz} leet>fallback</slot>                                                                                             {/**
<slot•foo={foo}•name="bar"•baz={baz}•leet>fallback</slot>↲    [generated] line 7                                                                      
<slot•foo={foo}•name="bar"•    {baz}•leet>fallback</slot>↲                                                                                            
<slot•foo={foo}•name="bar"•{baz}•leet>fallback</slot>↲        [original] line 5                                                                       
------------------------------------------------------------------------------------------------------------------------------------------------------ */}

<slot
    foo={foo} name="bar"                                                                                                                              {/**
------------------------------------------------------------------------------------------------------------------------------------------------------ */}
    baz={baz}                                                                                                                                         {/**
   ╚baz={baz}•↲    [generated] line 11                                                                                                                
   ╚    {baz}•↲                                                                                                                                       
   ╚{baz}•↲        [original] line 9                                                                                                                  
------------------------------------------------------------------------------------------------------------------------------------------------------ */}
    leet>fallback                                                                                                                                     {/**
------------------------------------------------------------------------------------------------------------------------------------------------------ */}
</slot></>                                                                                                                                            {/**
</slot></>↲    [generated] line 13                                                                                                                    
</slot>        [original] line 11                                                                                                                     
------------------------------------------------------------------------------------------------------------------------------------------------------ */}
return { props: {}, slots: {'default': {}, 'foo': {}, 'bar': {foo:foo, baz:baz}}, getters: {}, events: {} }}

export default class Input__SvelteComponent_ extends createSvelte2TsxComponent(__sveltets_partial(__sveltets_with_any_event(render))) {
}