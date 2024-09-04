"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[8813],{7862:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>V,contentTitle:()=>C,default:()=>E,frontMatter:()=>G,metadata:()=>P,toc:()=>S});var s=i(74848),r=i(28453),t=i(96540),l=i(18215),o=i(23104),a=i(56347),c=i(205),d=i(57485),h=i(31682),u=i(70679);function p(e){return t.Children.toArray(e).filter((e=>"\n"!==e)).map((e=>{if(!e||(0,t.isValidElement)(e)&&function(e){const{props:n}=e;return!!n&&"object"==typeof n&&"value"in n}(e))return e;throw new Error(`Docusaurus error: Bad <Tabs> child <${"string"==typeof e.type?e.type:e.type.name}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.`)}))?.filter(Boolean)??[]}function x(e){const{values:n,children:i}=e;return(0,t.useMemo)((()=>{const e=n??function(e){return p(e).map((e=>{let{props:{value:n,label:i,attributes:s,default:r}}=e;return{value:n,label:i,attributes:s,default:r}}))}(i);return function(e){const n=(0,h.XI)(e,((e,n)=>e.value===n.value));if(n.length>0)throw new Error(`Docusaurus error: Duplicate values "${n.map((e=>e.value)).join(", ")}" found in <Tabs>. Every value needs to be unique.`)}(e),e}),[n,i])}function j(e){let{value:n,tabValues:i}=e;return i.some((e=>e.value===n))}function m(e){let{queryString:n=!1,groupId:i}=e;const s=(0,a.W6)(),r=function(e){let{queryString:n=!1,groupId:i}=e;if("string"==typeof n)return n;if(!1===n)return null;if(!0===n&&!i)throw new Error('Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".');return i??null}({queryString:n,groupId:i});return[(0,d.aZ)(r),(0,t.useCallback)((e=>{if(!r)return;const n=new URLSearchParams(s.location.search);n.set(r,e),s.replace({...s.location,search:n.toString()})}),[r,s])]}function g(e){const{defaultValue:n,queryString:i=!1,groupId:s}=e,r=x(e),[l,o]=(0,t.useState)((()=>function(e){let{defaultValue:n,tabValues:i}=e;if(0===i.length)throw new Error("Docusaurus error: the <Tabs> component requires at least one <TabItem> children component");if(n){if(!j({value:n,tabValues:i}))throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${n}" but none of its children has the corresponding value. Available values are: ${i.map((e=>e.value)).join(", ")}. If you intend to show no default tab, use defaultValue={null} instead.`);return n}const s=i.find((e=>e.default))??i[0];if(!s)throw new Error("Unexpected error: 0 tabValues");return s.value}({defaultValue:n,tabValues:r}))),[a,d]=m({queryString:i,groupId:s}),[h,p]=function(e){let{groupId:n}=e;const i=function(e){return e?`docusaurus.tab.${e}`:null}(n),[s,r]=(0,u.Dv)(i);return[s,(0,t.useCallback)((e=>{i&&r.set(e)}),[i,r])]}({groupId:s}),g=(()=>{const e=a??h;return j({value:e,tabValues:r})?e:null})();(0,c.A)((()=>{g&&o(g)}),[g]);return{selectedValue:l,selectValue:(0,t.useCallback)((e=>{if(!j({value:e,tabValues:r}))throw new Error(`Can't select invalid tab value=${e}`);o(e),d(e),p(e)}),[d,p,r]),tabValues:r}}var f=i(92303);const b={tabList:"tabList__CuJ",tabItem:"tabItem_LNqP"};function v(e){let{className:n,block:i,selectedValue:r,selectValue:t,tabValues:a}=e;const c=[],{blockElementScrollPositionUntilNextRender:d}=(0,o.a_)(),h=e=>{const n=e.currentTarget,i=c.indexOf(n),s=a[i].value;s!==r&&(d(n),t(s))},u=e=>{let n=null;switch(e.key){case"Enter":h(e);break;case"ArrowRight":{const i=c.indexOf(e.currentTarget)+1;n=c[i]??c[0];break}case"ArrowLeft":{const i=c.indexOf(e.currentTarget)-1;n=c[i]??c[c.length-1];break}}n?.focus()};return(0,s.jsx)("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,l.A)("tabs",{"tabs--block":i},n),children:a.map((e=>{let{value:n,label:i,attributes:t}=e;return(0,s.jsx)("li",{role:"tab",tabIndex:r===n?0:-1,"aria-selected":r===n,ref:e=>c.push(e),onKeyDown:u,onClick:h,...t,className:(0,l.A)("tabs__item",b.tabItem,t?.className,{"tabs__item--active":r===n}),children:i??n},n)}))})}function w(e){let{lazy:n,children:i,selectedValue:r}=e;const o=(Array.isArray(i)?i:[i]).filter(Boolean);if(n){const e=o.find((e=>e.props.value===r));return e?(0,t.cloneElement)(e,{className:(0,l.A)("margin-top--md",e.props.className)}):null}return(0,s.jsx)("div",{className:"margin-top--md",children:o.map(((e,n)=>(0,t.cloneElement)(e,{key:n,hidden:e.props.value!==r})))})}function y(e){const n=g(e);return(0,s.jsxs)("div",{className:(0,l.A)("tabs-container",b.tabList),children:[(0,s.jsx)(v,{...n,...e}),(0,s.jsx)(w,{...n,...e})]})}function T(e){const n=(0,f.A)();return(0,s.jsx)(y,{...e,children:p(e.children)},String(n))}const I={tabItem:"tabItem_Ymn6"};function A(e){let{children:n,hidden:i,className:r}=e;return(0,s.jsx)("div",{role:"tabpanel",className:(0,l.A)(I.tabItem,r),hidden:i,children:n})}var k=i(57717);const G={title:"General Guide",description:"General Guide of AI Use Cases",tags:["guide"]},C="General Guide of AI Use Cases",P={id:"ai/usecase/guide",title:"General Guide",description:"General Guide of AI Use Cases",source:"@site/docs/ai/88-usecase/00_guide.mdx",sourceDirName:"ai/88-usecase",slug:"/ai/usecase/guide",permalink:"/ai/usecase/guide",draft:!1,unlisted:!1,editUrl:"https://github.com/TouchMarsSolutions/web9ai/tree/main/docs/ai/88-usecase/00_guide.mdx",tags:[{inline:!0,label:"guide",permalink:"/tags/guide"}],version:"current",sidebarPosition:0,frontMatter:{title:"General Guide",description:"General Guide of AI Use Cases",tags:["guide"]},sidebar:"aiSidebar",previous:{title:"Use Case",permalink:"/category/use-case-1"},next:{title:"articles about AI product ideas",permalink:"/ai/article/ai-product-ideas"}},V={},S=[{value:"Categories to focus",id:"categories-to-focus",level:2},{value:"Breakdown",id:"breakdown",level:2},{value:"<code>Txt2Txt</code>",id:"txt2txt",level:3},{value:"ChatGPT",id:"chatgpt",level:4},{value:"AI Agents",id:"ai-agents",level:4},{value:"<code>Txt2Img</code>",id:"txt2img",level:3},{value:"<code>Txt2Voice</code>",id:"txt2voice",level:3},{value:"<code>Voice2Voice</code>",id:"voice2voice",level:3},{value:"<code>Txt2Video</code>",id:"txt2video",level:3},{value:"<code>Digital Character</code>",id:"digital-character",level:3},{value:"Programming Code",id:"programming-code",level:2},{value:"Learning Resources",id:"learning-resources",level:2},{value:"Popular Playgrounds",id:"popular-playgrounds",level:2}];function D(e){const n={a:"a",admonition:"admonition",blockquote:"blockquote",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",h4:"h4",header:"header",img:"img",li:"li",ol:"ol",p:"p",strong:"strong",ul:"ul",...(0,r.R)(),...e.components},{Details:t}=n;return t||function(e,n){throw new Error("Expected "+(n?"component":"object")+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}("Details",!0),(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(n.header,{children:(0,s.jsx)(n.h1,{id:"general-guide-of-ai-use-cases",children:"General Guide of AI Use Cases"})}),"\n",(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsx)(n.p,{children:"This guide is a general introduction about what AI models or products are mature to use in real world use cases, and what NOT."})}),"\n",(0,s.jsx)(n.h2,{id:"categories-to-focus",children:"Categories to focus"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsx)(n.p,{children:"Today's AI models are generally used in the following categories:"})}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["Text 2 Text (",(0,s.jsx)(n.code,{children:"Txt2Txt"}),")","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["Summarization (",(0,s.jsx)(n.code,{children:"Sum"}),") for ",(0,s.jsx)(n.code,{children:"LD;DR"}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:"summarize paper"}),"\n",(0,s.jsx)(n.li,{children:"summarize reports"}),"\n",(0,s.jsx)(n.li,{children:"summarize videos (plugins help)"}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.li,{children:"Text Generation and Continuation"}),"\n",(0,s.jsx)(n.li,{children:"Text Classification"}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Image (",(0,s.jsx)(n.code,{children:"Txt2Img"}),")","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["Image 2 Image (",(0,s.jsx)(n.code,{children:"Img2Img"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Image 2 Text (",(0,s.jsx)(n.code,{children:"Img2Txt"}),")"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Voice (",(0,s.jsx)(n.code,{children:"Txt2Voice"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Voice 2 Voice (",(0,s.jsx)(n.code,{children:"Voice2Voice"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Video (",(0,s.jsx)(n.code,{children:"Txt2Video"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Code (see ",(0,s.jsx)(n.a,{href:"#programming-code",children:"Programming Code"}),")"]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"breakdown",children:"Breakdown"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsx)(n.p,{children:"Let's break down the above categories into more details:"})}),"\n",(0,s.jsx)(n.h3,{id:"txt2txt",children:(0,s.jsx)(n.code,{children:"Txt2Txt"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"Use text prompt to generate text"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["core usage includes:","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:"Summarization"}),"\n",(0,s.jsxs)(n.li,{children:["Text Generation and creative continuation, such as","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:"email"}),"\n",(0,s.jsx)(n.li,{children:"story"}),"\n",(0,s.jsx)(n.li,{children:"manual report"}),"\n",(0,s.jsxs)(n.li,{children:["product description (including yourself ","\ud83d\ude43",")"]}),"\n",(0,s.jsx)(n.li,{children:"song lyrics"}),"\n",(0,s.jsx)(n.li,{children:"Poetry"}),"\n",(0,s.jsx)(n.li,{children:"cosplay or role play"}),"\n",(0,s.jsx)(n.li,{children:"generate prompt for MidJourney/StableDiffusion"}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Read and Write programming code (see ",(0,s.jsx)(n.a,{href:"#programming-code",children:"Programming Code"}),")"]}),"\n",(0,s.jsx)(n.li,{children:"Basic Data Analysis (csv files preferred)"}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["the best products rawly based on their models:","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://chat.openai.com/",children:"OpenAI ChatGPT"})}),"\n"]}),"\n",(0,s.jsx)(n.admonition,{type:"warning",children:(0,s.jsx)(n.p,{children:"ai.com is no longer redirected to this site but to Elon Musk new site -> x.ai"})}),"\n",(0,s.jsxs)(n.ol,{start:"2",children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://gemini.google.com/app",children:"Google Gemini Advance"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://console.anthropic.com/",children:"Claude"})}),"\n",(0,s.jsxs)(n.li,{children:["Open Source ",(0,s.jsx)(n.a,{href:"https://ai.meta.com/llama/",children:"Meta Llama 2"})," | ",(0,s.jsx)(n.a,{href:"https://about.fb.com/news/2023/07/llama-2/",children:"Married with MSFT"}),"\n",(0,s.jsx)(k.Yu,{youTubeId:"LslC2nKEEGU"}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["portal websites to combined models:","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://poe.com/",children:"Poe"})}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h4,{id:"chatgpt",children:"ChatGPT"}),"\n",(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsx)(n.p,{children:"ChatGPT is the best model for text generation.\nWe emphasis it here because there are a bunch of hidden tricks to let you know"})}),"\n",(0,s.jsxs)(t,{children:[(0,s.jsxs)("summary",{children:["You will love the ",(0,s.jsx)(n.strong,{children:"ChatGPT Plus"})," plan"]}),(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["It defaults to GPT-4 if you are a ",(0,s.jsx)(n.a,{href:"https://openai.com/blog/chatgpt-plus",children:"plus member"})," (USD$20/month)"]}),"\n",(0,s.jsxs)(n.li,{children:["The ",(0,s.jsx)(n.code,{children:"Code Interpreter"})," can help you read files, such as ",(0,s.jsx)(n.code,{children:"json"}),", ",(0,s.jsx)(n.code,{children:"Java"}),", ",(0,s.jsx)(n.code,{children:"Perl"}),", csv (for Excel to open), PDF files, etc. Try to ask it for anythiing on top of your mind ","\ud83d\ude04",", e.g., ",(0,s.jsx)(n.em,{children:"'what is the problem with my Perl code?'"}),", ",(0,s.jsx)(n.em,{children:"'where is the bug in my Java file?'"})," etc.\n",(0,s.jsx)(n.img,{alt:"ChatGPT Code Interpreter",src:i(68169).A+"",width:"582",height:"696"}),"\n",(0,s.jsx)(n.img,{alt:"ChatGPT upload files",src:i(31091).A+"",width:"1638",height:"262"})]}),"\n",(0,s.jsxs)(n.li,{children:["It's a bunch of fun to play the plugins, for examples:\n",(0,s.jsx)(n.img,{alt:"ChatGPT plugins",src:i(89719).A+"",width:"2304",height:"1214"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:"WebPilot"}),"\n",(0,s.jsx)(n.li,{children:"Zapier"}),"\n",(0,s.jsx)(n.li,{children:"Expedia, Kayak,"}),"\n",(0,s.jsx)(n.li,{children:"AskYourPDF"}),"\n",(0,s.jsx)(n.li,{children:"Youtube Summary, VoxScript, Video Insights (or search with keyword Youtube)"}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.li,{children:'Don\'t forget to check the bottom line, the "ChatGPT xxxxxx version" link, you may find more tricks in the change log to play with.'}),"\n",(0,s.jsxs)(n.li,{children:["you can ",(0,s.jsx)(n.a,{href:"https://platform.openai.com/docs/plugins/introduction",children:"install your own plugins"})," as well."]}),"\n"]})]}),"\n",(0,s.jsx)(n.h4,{id:"ai-agents",children:"AI Agents"}),"\n",(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsxs)(n.p,{children:["AI agents become more popular and attractive to more developers than ",(0,s.jsx)(n.code,{children:"LLMs"}),".\nBe caution that these products (prototypes) are not mature yet, but it's still fun to play with them ","\ud83d\ude04","."]})}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://github.com/Significant-Gravitas/Auto-GPT",children:"AutoGPT"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://github.com/yoheinakajima/babyagi",children:"BabyAGI"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://agentgpt.reworkd.ai/",children:"AgentGPT"})}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/AntonOsika/gpt-engineer",children:"GPT Engineer"})," | ",(0,s.jsx)(n.a,{href:"https://www.youtube.com/watch?v=L0xiB0Im5QA",children:"YouTube"})]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/geekan/MetaGPT",children:"MetaGPT"})," | ",(0,s.jsx)(n.a,{href:"https://www.youtube.com/watch?v=q16Gi9pTG_M",children:"YouTube"})]}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.camel-ai.org/",children:"Camel"})}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/microsoft/JARVIS",children:"MSFT Jarvis / HuggingGPT"})," | ",(0,s.jsx)(n.a,{href:"https://arxiv.org/pdf/2303.17580.pdf",children:"Paper"})," | ",(0,s.jsx)(n.a,{href:"https://huggingface.co/spaces/microsoft/HuggingGPT",children:"HuggingFace Playground"})]}),"\n",(0,s.jsxs)(n.li,{children:["Fun game: ",(0,s.jsx)(n.a,{href:"https://towardsdatascience.com/4-autonomous-ai-agents-you-need-to-know-d612a643fa92",children:"Westworld"})]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"txt2img",children:(0,s.jsx)(n.code,{children:"Txt2Img"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"Use text to generate images"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["the best products - only 2:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.midjourney.com/app/",children:"MidJourney"})," - ",(0,s.jsx)(n.a,{href:"https://www.midjourney.com/account/",children:"paid plan"}),"\n",(0,s.jsx)(k.Yu,{youTubeId:"G6FjxnO437c"}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["open source model ",(0,s.jsx)(n.a,{href:"https://stablediffusionweb.com/",children:"Stable Diffusion"}),"\n",(0,s.jsx)(k.Yu,{youTubeId:"kqXpAKVQDNU"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["prompt and ",(0,s.jsx)(n.code,{children:"checkpoint"})," sites:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://prompthero.com/",children:"PromptHero"})}),"\n",(0,s.jsxs)(n.li,{children:["famous ",(0,s.jsx)(n.a,{href:"https://civitai.com/",children:"CiviTai"}),"\n",(0,s.jsx)(n.img,{alt:"civitai runmodel",src:i(93083).A+"",width:"2772",height:"1416"}),"\n",(0,s.jsx)(n.img,{alt:"civitai runmodel selection",src:i(99322).A+"",width:"2744",height:"1456"})]}),"\n",(0,s.jsxs)(n.li,{children:["more online playing websites will be discovered ","\u2764\ufe0f"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["a few playing projects or sites:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/AUTOMATIC1111/stable-diffusion-webui",children:"SD WebUI"})," open sourced"]}),"\n",(0,s.jsxs)(n.li,{children:["DIY and play your own hosting server: ",(0,s.jsx)(n.a,{href:"https://app.rundiffusion.com?ref=web9ai15",children:"Run Diffusion"})]}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.adobe.com/ca/sensei/generative-ai/firefly.html",children:"Adobe Firefly"}),", btw, great transformation, ",(0,s.jsx)(n.a,{href:"https://www.adobe.com/ca/sensei.html",children:"Adobe"}),"!!!"]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://labs.openai.com/",children:"OpenAI"})," and Bing(",(0,s.jsx)(n.a,{href:"https://www.microsoft.com/en-us/edge/download",children:"Download Microsoft Edge browser"}),") also provide ",(0,s.jsx)(n.a,{href:"https://openai.com/dall-e-2",children:"Dall-E 2"})," model :thumbsdown: but we are waiting for Dall-E 3"]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"txt2voice",children:(0,s.jsx)(n.code,{children:"Txt2Voice"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"use text to generate voice, and visa versa"}),"\n"]}),"\n",(0,s.jsxs)(T,{children:[(0,s.jsx)(A,{value:"txt2voice",label:"Txt2Voice",children:(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["popular open source projects:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/suno-ai/bark",children:"Bark"}),"\n",(0,s.jsx)(k.Yu,{youTubeId:"lDeeSjShilQ"}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Chinese txt2voice services:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://ai.baidu.com/tech/speech/tts",children:"Baidu"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://global.xfyun.cn/products/online_tts",children:"XunFei"})}),"\n"]}),"\n"]}),"\n"]})}),(0,s.jsxs)(A,{value:"music",label:"Music",children:[(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsxs)(n.p,{children:[(0,s.jsx)(n.strong,{children:"Meta AudioCraft"}),"\nnot very mature technology but fun to play, and ",(0,s.jsx)(n.strong,{children:"not commercially"})," ready yet."]})}),(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/facebookresearch/audiocraft",children:"Meta AudioCraft"})," uses ",(0,s.jsx)(n.a,{href:"https://github.com/facebookresearch/audiocraft/blob/main/docs/MUSICGEN.md",children:"Meta MusicGen"}),"\n",(0,s.jsx)(k.Yu,{youTubeId:"map22OdIUp8"}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["another playgrounds","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://replicate.com/pollinations/music-gen",children:"Replicate Spaces"})," (pay per use)"]}),"\n"]}),"\n"]}),"\n"]})]}),(0,s.jsx)(A,{value:"voice2txt",label:"Voice2Txt",children:(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:['you can easily run the OpenAI open source "Voice to Text" model, ',(0,s.jsx)(n.a,{href:"https://github.com/openai/whisper",children:"Whisper"}),", to convert any audio file to subtitle"]}),"\n",(0,s.jsxs)(n.li,{children:["alternatively you can run it in some cloud, e.g., ",(0,s.jsx)(n.a,{href:"https://replicate.ai/openai/whisper",children:"Replicate"})," (pay per use)"]}),"\n"]})})]}),"\n",(0,s.jsx)(n.h3,{id:"voice2voice",children:(0,s.jsx)(n.code,{children:"Voice2Voice"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"use one voice to generate another voice"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["popular open source projects:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/svc-develop-team/so-vits-svc",children:"so-vits-svc"}),"\n",(0,s.jsx)(k.Yu,{youTubeId:"tZn0lcGO5OQ"}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"txt2video",children:(0,s.jsx)(n.code,{children:"Txt2Video"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"use text to generate video"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["Currently ",(0,s.jsx)(n.a,{href:"https://research.runwayml.com/gen2",children:"Runway Gen2"})," is providing the best services (few min free)","\n",(0,s.jsx)(k.Yu,{youTubeId:"trXPfpV5iRQ"}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"digital-character",children:(0,s.jsx)(n.code,{children:"Digital Character"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"this technology is not mature yet, but it's still fun to play some famous products:"}),"\n"]}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.d-id.com/",children:"d-id"}),"\n",(0,s.jsx)(n.img,{alt:"d-id",src:i(64199).A+"",width:"2880",height:"1602"})]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://app.heygen.com/guest/templates?cid=5e24983e",children:"HeyGen"}),"\n",(0,s.jsx)(n.img,{alt:"heygen",src:i(18601).A+"",width:"2824",height:"1472"})]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"programming-code",children:"Programming Code"}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsxs)(n.p,{children:["plugins integrated into modern IDEs to help you write code (",(0,s.jsx)(n.a,{href:"https://code.visualstudio.com/",children:"VsCode"}),", ",(0,s.jsx)(n.a,{href:"https://www.jetbrains.com/idea/",children:"IntelliJ"}),", etc.)"]}),"\n"]}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/features/copilot",children:"Github Copilot"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsxs)(n.p,{children:["Future -> ",(0,s.jsx)(n.a,{href:"https://github.com/features/preview/copilot-x",children:"Github Copilot X"})]})}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.cursor.so/",children:"Open Source Cursor"})," helps you write code in browser"]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"learning-resources",children:"Learning Resources"}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"Popular learning resources to suggested:"}),"\n"]}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsxs)(n.p,{children:["Our ",(0,s.jsx)(n.a,{href:"/ai/prompt/prompt-guides",children:"Prompt Guides"}),". A few hightlights are:"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-openai-api",children:"OpenAI Best Practices"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.promptingguide.ai/",children:"Prompt Engineering Guide"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://learn.microsoft.com/en-us/azure/cognitive-services/openai/concepts/advanced-prompt-engineering?pivots=programming-language-chat-completions#specifying-the-output-structure",children:"Microsoft Prompt engineering techniques"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/",children:"Prompt Engineering by Lilian Weng"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://prompthero.com/",children:"PromptHero"})}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsx)(n.p,{children:(0,s.jsx)(n.a,{href:"https://www.deeplearning.ai/short-courses/",children:"Andrew Ng AI courses"})}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"popular-playgrounds",children:"Popular Playgrounds"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsx)(n.p,{children:"Few famous playgrounds to play with different models for free, in case if you don't have a good GPU."})}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://huggingface.co/spaces",children:"HuggingFace"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://replicate.com/explore",children:"Replicate"})}),"\n"]})]})}function E(e={}){const{wrapper:n}={...(0,r.R)(),...e.components};return n?(0,s.jsx)(n,{...e,children:(0,s.jsx)(D,{...e})}):D(e)}},68169:(e,n,i)=>{i.d(n,{A:()=>s});const s=i.p+"assets/images/chatgpt-models-1e7c4dc2fcdb783ead4fabd176af5347.png"},89719:(e,n,i)=>{i.d(n,{A:()=>s});const s=i.p+"assets/images/chatgpt-plugins-ae2dbb99ee324232dd04b71bc5f1ada9.png"},31091:(e,n,i)=>{i.d(n,{A:()=>s});const s=i.p+"assets/images/chatgpt-upload_file-092a0a71ea5b87955440be59880da922.png"},99322:(e,n,i)=>{i.d(n,{A:()=>s});const s=i.p+"assets/images/civitai-runmodel-selection-3486df6ce3988513032500dff95f7169.png"},93083:(e,n,i)=>{i.d(n,{A:()=>s});const s=i.p+"assets/images/civitai-runmodel-e07f4ce976c8017cb73c876cd3fcd425.png"},64199:(e,n,i)=>{i.d(n,{A:()=>s});const s=i.p+"assets/images/d-id-4f2ba3c2e9dd4fe6b48beefb031e97c1.png"},18601:(e,n,i)=>{i.d(n,{A:()=>s});const s=i.p+"assets/images/heygen-0a70d2ecab0ba0bf075a3f5d2ed4ff85.png"}}]);