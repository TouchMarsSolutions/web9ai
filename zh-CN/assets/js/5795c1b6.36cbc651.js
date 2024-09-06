"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[5117],{72017:(e,n,a)=>{a.r(n),a.d(n,{assets:()=>A,contentTitle:()=>S,default:()=>V,frontMatter:()=>I,metadata:()=>_,toc:()=>q});var t=a(74848),l=a(28453),r=a(96540),s=a(18215),i=a(23104),o=a(56347),u=a(205),c=a(57485),d=a(31682),h=a(70679);function p(e){return r.Children.toArray(e).filter((e=>"\n"!==e)).map((e=>{if(!e||(0,r.isValidElement)(e)&&function(e){const{props:n}=e;return!!n&&"object"==typeof n&&"value"in n}(e))return e;throw new Error(`Docusaurus error: Bad <Tabs> child <${"string"==typeof e.type?e.type:e.type.name}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.`)}))?.filter(Boolean)??[]}function v(e){const{values:n,children:a}=e;return(0,r.useMemo)((()=>{const e=n??function(e){return p(e).map((e=>{let{props:{value:n,label:a,attributes:t,default:l}}=e;return{value:n,label:a,attributes:t,default:l}}))}(a);return function(e){const n=(0,d.XI)(e,((e,n)=>e.value===n.value));if(n.length>0)throw new Error(`Docusaurus error: Duplicate values "${n.map((e=>e.value)).join(", ")}" found in <Tabs>. Every value needs to be unique.`)}(e),e}),[n,a])}function m(e){let{value:n,tabValues:a}=e;return a.some((e=>e.value===n))}function b(e){let{queryString:n=!1,groupId:a}=e;const t=(0,o.W6)(),l=function(e){let{queryString:n=!1,groupId:a}=e;if("string"==typeof n)return n;if(!1===n)return null;if(!0===n&&!a)throw new Error('Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".');return a??null}({queryString:n,groupId:a});return[(0,c.aZ)(l),(0,r.useCallback)((e=>{if(!l)return;const n=new URLSearchParams(t.location.search);n.set(l,e),t.replace({...t.location,search:n.toString()})}),[l,t])]}function g(e){const{defaultValue:n,queryString:a=!1,groupId:t}=e,l=v(e),[s,i]=(0,r.useState)((()=>function(e){let{defaultValue:n,tabValues:a}=e;if(0===a.length)throw new Error("Docusaurus error: the <Tabs> component requires at least one <TabItem> children component");if(n){if(!m({value:n,tabValues:a}))throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${n}" but none of its children has the corresponding value. Available values are: ${a.map((e=>e.value)).join(", ")}. If you intend to show no default tab, use defaultValue={null} instead.`);return n}const t=a.find((e=>e.default))??a[0];if(!t)throw new Error("Unexpected error: 0 tabValues");return t.value}({defaultValue:n,tabValues:l}))),[o,c]=b({queryString:a,groupId:t}),[d,p]=function(e){let{groupId:n}=e;const a=function(e){return e?`docusaurus.tab.${e}`:null}(n),[t,l]=(0,h.Dv)(a);return[t,(0,r.useCallback)((e=>{a&&l.set(e)}),[a,l])]}({groupId:t}),g=(()=>{const e=o??d;return m({value:e,tabValues:l})?e:null})();(0,u.A)((()=>{g&&i(g)}),[g]);return{selectedValue:s,selectValue:(0,r.useCallback)((e=>{if(!m({value:e,tabValues:l}))throw new Error(`Can't select invalid tab value=${e}`);i(e),c(e),p(e)}),[c,p,l]),tabValues:l}}var f=a(92303);const x={tabList:"tabList__CuJ",tabItem:"tabItem_LNqP"};function j(e){let{className:n,block:a,selectedValue:l,selectValue:r,tabValues:o}=e;const u=[],{blockElementScrollPositionUntilNextRender:c}=(0,i.a_)(),d=e=>{const n=e.currentTarget,a=u.indexOf(n),t=o[a].value;t!==l&&(c(n),r(t))},h=e=>{let n=null;switch(e.key){case"Enter":d(e);break;case"ArrowRight":{const a=u.indexOf(e.currentTarget)+1;n=u[a]??u[0];break}case"ArrowLeft":{const a=u.indexOf(e.currentTarget)-1;n=u[a]??u[u.length-1];break}}n?.focus()};return(0,t.jsx)("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,s.A)("tabs",{"tabs--block":a},n),children:o.map((e=>{let{value:n,label:a,attributes:r}=e;return(0,t.jsx)("li",{role:"tab",tabIndex:l===n?0:-1,"aria-selected":l===n,ref:e=>u.push(e),onKeyDown:h,onClick:d,...r,className:(0,s.A)("tabs__item",x.tabItem,r?.className,{"tabs__item--active":l===n}),children:a??n},n)}))})}function y(e){let{lazy:n,children:a,selectedValue:l}=e;const i=(Array.isArray(a)?a:[a]).filter(Boolean);if(n){const e=i.find((e=>e.props.value===l));return e?(0,r.cloneElement)(e,{className:(0,s.A)("margin-top--md",e.props.className)}):null}return(0,t.jsx)("div",{className:"margin-top--md",children:i.map(((e,n)=>(0,r.cloneElement)(e,{key:n,hidden:e.props.value!==l})))})}function w(e){const n=g(e);return(0,t.jsxs)("div",{className:(0,s.A)("tabs-container",x.tabList),children:[(0,t.jsx)(j,{...n,...e}),(0,t.jsx)(y,{...n,...e})]})}function C(e){const n=(0,f.A)();return(0,t.jsx)(w,{...e,children:p(e.children)},String(n))}const k={tabItem:"tabItem_Ymn6"};function T(e){let{children:n,hidden:a,className:l}=e;return(0,t.jsx)("div",{role:"tabpanel",className:(0,s.A)(k.tabItem,l),hidden:a,children:n})}const I={title:"Learn Coding with AI-Copilot",description:"This article provides a comprehensive overview of five major programming languages - Java, Kotlin, Python, TypeScript, and C#. We'll explore three fundamental concepts across these languages - variables, functions, and classes."},S="How-to become one Full Stack AI-Copilot Developer",_={id:"dev/learn_ai_coding",title:"Learn Coding with AI-Copilot",description:"This article provides a comprehensive overview of five major programming languages - Java, Kotlin, Python, TypeScript, and C#. We'll explore three fundamental concepts across these languages - variables, functions, and classes.",source:"@site/docs/dev/23_learn_ai_coding.md",sourceDirName:"dev",slug:"/dev/learn_ai_coding",permalink:"/zh-CN/dev/learn_ai_coding",draft:!1,unlisted:!1,editUrl:"https://github.com/TouchMarsSolutions/web9ai/tree/main/docs/dev/23_learn_ai_coding.md",tags:[],version:"current",sidebarPosition:23,frontMatter:{title:"Learn Coding with AI-Copilot",description:"This article provides a comprehensive overview of five major programming languages - Java, Kotlin, Python, TypeScript, and C#. We'll explore three fundamental concepts across these languages - variables, functions, and classes."},sidebar:"devSidebar",previous:{title:"python",permalink:"/zh-CN/dev/python"}},A={},q=[{value:"Prerequisites",id:"prerequisites",level:2},{value:"Outline - 3 Modules",id:"outline---3-modules",level:2},{value:"Purpose - Have Fun",id:"purpose---have-fun",level:2},{value:"Variables",id:"variables",level:2},{value:"basic data types",id:"basic-data-types",level:3},{value:"Functions",id:"functions",level:2},{value:"Classes",id:"classes",level:2}];function N(e){const n={admonition:"admonition",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",header:"header",img:"img",li:"li",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,l.R)(),...e.components};return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(n.header,{children:(0,t.jsx)(n.h1,{id:"how-to-become-one-full-stack-ai-copilot-developer",children:"How-to become one Full Stack AI-Copilot Developer"})}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["\n",(0,t.jsxs)(n.p,{children:["what is ",(0,t.jsx)(n.strong,{children:"AI-Copilot"}),"?"]}),"\n",(0,t.jsxs)(n.blockquote,{children:["\n",(0,t.jsx)(n.p,{children:"AI-Copilot means using AI tools (e.g. ChatGPT, Claude, Github Copilot, Cursor, etc.) that help developers write code faster and with fewer errors. It uses machine learning to analyze code and provide suggestions for how to improve it. This article provides a comprehensive overview of five major programming languages: Java, Kotlin, Python, TypeScript, and C#. We'll explore three fundamental concepts across these languages: variables, functions, and classes."}),"\n"]}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["\n",(0,t.jsx)(n.p,{children:"what will we learn today (1 hour)?"}),"\n",(0,t.jsxs)(n.blockquote,{children:["\n",(0,t.jsx)(n.p,{children:"we will learn all the major programming languages and frameworks that are used in the industry, in one-shot!"}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,t.jsx)(n.h2,{id:"prerequisites",children:"Prerequisites"}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"Grade 7+ or 12+"}),"\n"]}),"\n",(0,t.jsx)(n.h2,{id:"outline---3-modules",children:"Outline - 3 Modules"}),"\n",(0,t.jsxs)(n.blockquote,{children:["\n",(0,t.jsx)(n.p,{children:"we will only learn 3 modules and each of them will apply to all the programming languages: variables, functions, and classes."}),"\n"]}),"\n",(0,t.jsx)(n.h2,{id:"purpose---have-fun",children:"Purpose - Have Fun"}),"\n",(0,t.jsx)(n.p,{children:"Now that we've outlined our learning path, it's time to dive into the fascinating world of programming languages. We'll explore variables, functions, and classes across Java, Kotlin, Python, TypeScript, and C#."}),"\n",(0,t.jsxs)(n.p,{children:["Remember, the goal is ",(0,t.jsx)(n.strong,{children:"NOT to memorize every detail"}),", and ",(0,t.jsx)(n.strong,{children:"NOT to become an coding guru"}),", but to understand the core concepts thus to be able to build software products to generate revenue $$$ in real-world. This comparative approach will help you grasp the underlying principles of programming and adapt more easily to new languages in the future."]}),"\n",(0,t.jsx)(n.p,{children:"Let's start with variables, the building blocks of any program!"}),"\n",(0,t.jsx)(n.h2,{id:"variables",children:"Variables"}),"\n",(0,t.jsx)(n.admonition,{type:"info",children:(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["every language has variables, such as Math. All you need to understand in this module is only a few things:","\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"what are the basic data types in each language?"}),"\n",(0,t.jsx)(n.li,{children:"how to define a variable?"}),"\n",(0,t.jsx)(n.li,{children:"how to assign a value to a variable?"}),"\n"]}),"\n"]}),"\n"]})}),"\n",(0,t.jsx)(n.h3,{id:"basic-data-types",children:"basic data types"}),"\n",(0,t.jsx)(n.p,{children:"Let's get a quick list of basic data types for each language:"}),"\n",(0,t.jsxs)(C,{children:[(0,t.jsxs)(T,{value:"java",label:"Java",default:!0,children:[(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"Number: byte, short, int, long, float, double"}),"\n",(0,t.jsx)(n.li,{children:"Boolean"}),"\n",(0,t.jsx)(n.li,{children:"String"}),"\n"]}),(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-java",metastring:"live inline",live:!0,children:'var age = 18;\nvar height = 180.5;\nvar name = "Jack";\nvar isStudent = true;\nSystem.out.println("Hello, " + name + "! You are " + age + " years old and " + height + " cm tall. Are you a student? " + isStudent);\n'})}),(0,t.jsxs)(n.p,{children:["Run it => Result:\n",(0,t.jsx)(n.img,{alt:"Java Number Demo",src:a(98265).A+"",width:"1756",height:"168"})]})]}),(0,t.jsx)(T,{value:"kotlin",label:"Kotlin",children:(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"Number: Byte, Short, Int, Long, Float, Double"}),"\n",(0,t.jsx)(n.li,{children:"Boolean"}),"\n",(0,t.jsx)(n.li,{children:"Char"}),"\n"]})}),(0,t.jsx)(T,{value:"python",label:"Python",children:(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"int, float"}),"\n",(0,t.jsx)(n.li,{children:"bool"}),"\n",(0,t.jsx)(n.li,{children:"str"}),"\n"]})}),(0,t.jsx)(T,{value:"typescript",label:"TypeScript",children:(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"number"}),"\n",(0,t.jsx)(n.li,{children:"boolean"}),"\n",(0,t.jsx)(n.li,{children:"string"}),"\n",(0,t.jsx)(n.li,{children:"null"}),"\n",(0,t.jsx)(n.li,{children:"undefined"}),"\n"]})}),(0,t.jsx)(T,{value:"csharp",label:"C#",children:(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"sbyte, byte, short, ushort, int, uint, long, ulong"}),"\n",(0,t.jsx)(n.li,{children:"float, double, decimal"}),"\n",(0,t.jsx)(n.li,{children:"bool"}),"\n",(0,t.jsx)(n.li,{children:"char"}),"\n"]})})]}),"\n",(0,t.jsx)(n.admonition,{type:"success",children:(0,t.jsx)(n.p,{children:"That's all you need to know about variables, to be able to write software product. \ud83c\udf89\ud83d\ude80\ud83d\udca1\ud83c\udf8a\ud83e\udd42"})}),"\n",(0,t.jsx)(n.h2,{id:"functions",children:"Functions"}),"\n",(0,t.jsx)(n.h2,{id:"classes",children:"Classes"})]})}function V(e={}){const{wrapper:n}={...(0,l.R)(),...e.components};return n?(0,t.jsx)(n,{...e,children:(0,t.jsx)(N,{...e})}):N(e)}},98265:(e,n,a)=>{a.d(n,{A:()=>t});const t=a.p+"assets/images/java_000-ecae55ca7f132dfae6a058462b69d4d7.png"},28453:(e,n,a)=>{a.d(n,{R:()=>s,x:()=>i});var t=a(96540);const l={},r=t.createContext(l);function s(e){const n=t.useContext(r);return t.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function i(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(l):e.components||l:s(e.components),t.createElement(r.Provider,{value:n},e.children)}}}]);