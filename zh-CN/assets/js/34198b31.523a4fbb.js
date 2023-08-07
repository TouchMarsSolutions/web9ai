"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[3564],{5732:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>A,contentTitle:()=>P,default:()=>D,frontMatter:()=>G,metadata:()=>V,toc:()=>E});var s=i(5893),t=i(1151),r=i(7462),l=i(7294),o=i(6010),a=i(2466),c=i(6550),d=i(1980),h=i(7392),u=i(12);function p(e){return l.Children.toArray(e).filter((e=>"\n"!==e)).map((e=>{if(!e||(0,l.isValidElement)(e)&&function(e){const{props:n}=e;return!!n&&"object"==typeof n&&"value"in n}(e))return e;throw new Error(`Docusaurus error: Bad <Tabs> child <${"string"==typeof e.type?e.type:e.type.name}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.`)}))?.filter(Boolean)??[]}function x(e){const{values:n,children:i}=e;return(0,l.useMemo)((()=>{const e=n??function(e){return p(e).map((e=>{let{props:{value:n,label:i,attributes:s,default:t}}=e;return{value:n,label:i,attributes:s,default:t}}))}(i);return function(e){const n=(0,h.l)(e,((e,n)=>e.value===n.value));if(n.length>0)throw new Error(`Docusaurus error: Duplicate values "${n.map((e=>e.value)).join(", ")}" found in <Tabs>. Every value needs to be unique.`)}(e),e}),[n,i])}function j(e){let{value:n,tabValues:i}=e;return i.some((e=>e.value===n))}function m(e){let{queryString:n=!1,groupId:i}=e;const s=(0,c.k6)(),t=function(e){let{queryString:n=!1,groupId:i}=e;if("string"==typeof n)return n;if(!1===n)return null;if(!0===n&&!i)throw new Error('Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".');return i??null}({queryString:n,groupId:i});return[(0,d._X)(t),(0,l.useCallback)((e=>{if(!t)return;const n=new URLSearchParams(s.location.search);n.set(t,e),s.replace({...s.location,search:n.toString()})}),[t,s])]}function g(e){const{defaultValue:n,queryString:i=!1,groupId:s}=e,t=x(e),[r,o]=(0,l.useState)((()=>function(e){let{defaultValue:n,tabValues:i}=e;if(0===i.length)throw new Error("Docusaurus error: the <Tabs> component requires at least one <TabItem> children component");if(n){if(!j({value:n,tabValues:i}))throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${n}" but none of its children has the corresponding value. Available values are: ${i.map((e=>e.value)).join(", ")}. If you intend to show no default tab, use defaultValue={null} instead.`);return n}const s=i.find((e=>e.default))??i[0];if(!s)throw new Error("Unexpected error: 0 tabValues");return s.value}({defaultValue:n,tabValues:t}))),[a,c]=m({queryString:i,groupId:s}),[d,h]=function(e){let{groupId:n}=e;const i=function(e){return e?`docusaurus.tab.${e}`:null}(n),[s,t]=(0,u.Nk)(i);return[s,(0,l.useCallback)((e=>{i&&t.set(e)}),[i,t])]}({groupId:s}),p=(()=>{const e=a??d;return j({value:e,tabValues:t})?e:null})();(0,l.useLayoutEffect)((()=>{p&&o(p)}),[p]);return{selectedValue:r,selectValue:(0,l.useCallback)((e=>{if(!j({value:e,tabValues:t}))throw new Error(`Can't select invalid tab value=${e}`);o(e),c(e),h(e)}),[c,h,t]),tabValues:t}}var f=i(2389);const b={tabList:"tabList__CuJ",tabItem:"tabItem_LNqP"};function v(e){let{className:n,block:i,selectedValue:s,selectValue:t,tabValues:c}=e;const d=[],{blockElementScrollPositionUntilNextRender:h}=(0,a.o5)(),u=e=>{const n=e.currentTarget,i=d.indexOf(n),r=c[i].value;r!==s&&(h(n),t(r))},p=e=>{let n=null;switch(e.key){case"Enter":u(e);break;case"ArrowRight":{const i=d.indexOf(e.currentTarget)+1;n=d[i]??d[0];break}case"ArrowLeft":{const i=d.indexOf(e.currentTarget)-1;n=d[i]??d[d.length-1];break}}n?.focus()};return l.createElement("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,o.Z)("tabs",{"tabs--block":i},n)},c.map((e=>{let{value:n,label:i,attributes:t}=e;return l.createElement("li",(0,r.Z)({role:"tab",tabIndex:s===n?0:-1,"aria-selected":s===n,key:n,ref:e=>d.push(e),onKeyDown:p,onClick:u},t,{className:(0,o.Z)("tabs__item",b.tabItem,t?.className,{"tabs__item--active":s===n})}),i??n)})))}function y(e){let{lazy:n,children:i,selectedValue:s}=e;const t=(Array.isArray(i)?i:[i]).filter(Boolean);if(n){const e=t.find((e=>e.props.value===s));return e?(0,l.cloneElement)(e,{className:"margin-top--md"}):null}return l.createElement("div",{className:"margin-top--md"},t.map(((e,n)=>(0,l.cloneElement)(e,{key:n,hidden:e.props.value!==s}))))}function w(e){const n=g(e);return l.createElement("div",{className:(0,o.Z)("tabs-container",b.tabList)},l.createElement(v,(0,r.Z)({},e,n)),l.createElement(y,(0,r.Z)({},e,n)))}function T(e){const n=(0,f.Z)();return l.createElement(w,(0,r.Z)({key:String(n)},e),p(e.children))}const I={tabItem:"tabItem_Ymn6"};function k(e){let{children:n,hidden:i,className:s}=e;return l.createElement("div",{role:"tabpanel",className:(0,o.Z)(I.tabItem,s),hidden:i},n)}var C=i(6222);const G={title:"General Guide",description:"General Guide of AI Use Cases",tags:["guide"]},P="General Guide of AI Use Cases",V={unversionedId:"usecase/guide",id:"usecase/guide",title:"General Guide",description:"General Guide of AI Use Cases",source:"@site/docs/88-usecase/guide.mdx",sourceDirName:"88-usecase",slug:"/usecase/guide",permalink:"/zh-CN/ai/usecase/guide",draft:!1,unlisted:!1,editUrl:"https://github.com/TouchMarsSolutions/web9ai/tree/main/docs/88-usecase/guide.mdx",tags:[{label:"guide",permalink:"/zh-CN/ai/tags/guide"}],version:"current",frontMatter:{title:"General Guide",description:"General Guide of AI Use Cases",tags:["guide"]},sidebar:"docsSidebar",previous:{title:"Use Case",permalink:"/zh-CN/ai/category/use-case"},next:{title:"articles about AI product ideas",permalink:"/zh-CN/ai/article/ai-product-ideas"}},A={},E=[{value:"Categories to focus",id:"categories-to-focus",level:2},{value:"Breakdown",id:"breakdown",level:2},{value:"<code>Txt2Txt</code>",id:"txt2txt",level:3},{value:"ChatGPT",id:"chatgpt",level:4},{value:"AI Agents",id:"ai-agents",level:4},{value:"<code>Txt2Img</code>",id:"txt2img",level:3},{value:"<code>Txt2Voice</code>",id:"txt2voice",level:3},{value:"<code>Voice2Voice</code>",id:"voice2voice",level:3},{value:"<code>Txt2Video</code>",id:"txt2video",level:3},{value:"<code>Digital Character</code>",id:"digital-character",level:3},{value:"Programming Code",id:"programming-code",level:2},{value:"Learning Resources",id:"learning-resources",level:2},{value:"Popular Playgrounds",id:"popular-playgrounds",level:2}];function S(e){const n=Object.assign({h1:"h1",admonition:"admonition",p:"p",h2:"h2",ol:"ol",li:"li",code:"code",a:"a",h3:"h3",blockquote:"blockquote",ul:"ul",h4:"h4",strong:"strong",em:"em",img:"img"},(0,t.ah)(),e.components),{Details:r}=n;return r||function(e,n){throw new Error("Expected "+(n?"component":"object")+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}("Details",!0),(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(n.h1,{id:"general-guide-of-ai-use-cases",children:"General Guide of AI Use Cases"}),"\n",(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsx)(n.p,{children:"This guide is a general introduction about what AI models or products are mature to use in real world use cases, and what NOT."})}),"\n",(0,s.jsx)(n.h2,{id:"categories-to-focus",children:"Categories to focus"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsx)(n.p,{children:"Today's AI models are generally used in the following categories:"})}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["Text 2 Text (",(0,s.jsx)(n.code,{children:"Txt2Txt"}),")","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["Summarization (",(0,s.jsx)(n.code,{children:"Sum"}),") for ",(0,s.jsx)(n.code,{children:"LD;DR"}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:"summarize paper"}),"\n",(0,s.jsx)(n.li,{children:"summarize reports"}),"\n",(0,s.jsx)(n.li,{children:"summarize videos (plugins help)"}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.li,{children:"Text Generation and Continuation"}),"\n",(0,s.jsx)(n.li,{children:"Text Classification"}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Image (",(0,s.jsx)(n.code,{children:"Txt2Img"}),")","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["Image 2 Image (",(0,s.jsx)(n.code,{children:"Img2Img"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Image 2 Text (",(0,s.jsx)(n.code,{children:"Img2Txt"}),")"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Voice (",(0,s.jsx)(n.code,{children:"Txt2Voice"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Voice 2 Voice (",(0,s.jsx)(n.code,{children:"Voice2Voice"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Video (",(0,s.jsx)(n.code,{children:"Txt2Video"}),")"]}),"\n",(0,s.jsxs)(n.li,{children:["Text 2 Code (see ",(0,s.jsx)(n.a,{href:"#programming-code",children:"Programming Code"}),")"]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"breakdown",children:"Breakdown"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsx)(n.p,{children:"Let's break down the above categories into more details:"})}),"\n",(0,s.jsx)(n.h3,{id:"txt2txt",children:(0,s.jsx)(n.code,{children:"Txt2Txt"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"Use text prompt to generate text"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["core usage includes:","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:"Summarization"}),"\n",(0,s.jsxs)(n.li,{children:["Text Generation and creative continuation, such as","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:"email"}),"\n",(0,s.jsx)(n.li,{children:"story"}),"\n",(0,s.jsx)(n.li,{children:"manual report"}),"\n",(0,s.jsx)(n.li,{children:"product description (including yourself \ud83d\ude43)"}),"\n",(0,s.jsx)(n.li,{children:"song lyrics"}),"\n",(0,s.jsx)(n.li,{children:"Poetry"}),"\n",(0,s.jsx)(n.li,{children:"cosplay or role play"}),"\n",(0,s.jsx)(n.li,{children:"generate prompt for MidJourney/StableDiffusion"}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Read and Write programming code (see ",(0,s.jsx)(n.a,{href:"#programming-code",children:"Programming Code"}),")"]}),"\n",(0,s.jsx)(n.li,{children:"Basic Data Analysis (csv files preferred)"}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["the best products rawly based on their models:","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://chat.openai.com/",children:"OpenAI ChatGPT"})}),"\n"]}),"\n",(0,s.jsx)(n.admonition,{type:"warning",children:(0,s.jsx)(n.p,{children:"ai.com is no longer redirected to this site but to Elon Musk new site -> x.ai"})}),"\n",(0,s.jsxs)(n.ol,{start:"2",children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://bard.google.com/",children:"Google Bard"})," (sorry Canada not yet)"]}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://console.anthropic.com/",children:"Claude"})}),"\n",(0,s.jsxs)(n.li,{children:["Open Source ",(0,s.jsx)(n.a,{href:"https://ai.meta.com/llama/",children:"Meta Llama 2"})," | ",(0,s.jsx)(n.a,{href:"https://about.fb.com/news/2023/07/llama-2/",children:"Married with MSFT"}),"\n",(0,s.jsx)(C._F,{youTubeId:"LslC2nKEEGU"}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["portal websites to combined models:","\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://poe.com/",children:"Poe"})}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h4,{id:"chatgpt",children:"ChatGPT"}),"\n",(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsx)(n.p,{children:"ChatGPT is the best model for text generation.\nWe emphasis it here because there are a bunch of hidden tricks to let you know"})}),"\n",(0,s.jsxs)(r,{children:[(0,s.jsxs)("summary",{children:["You will love the ",(0,s.jsx)(n.strong,{children:"ChatGPT Plus"})," plan"]}),(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["It defaults to GPT-4 if you are a ",(0,s.jsx)(n.a,{href:"https://openai.com/blog/chatgpt-plus",children:"plus member"})," (USD$20/month)"]}),"\n",(0,s.jsxs)(n.li,{children:["The ",(0,s.jsx)(n.code,{children:"Code Interpreter"})," can help you read files, such as ",(0,s.jsx)(n.code,{children:"json"}),", ",(0,s.jsx)(n.code,{children:"Java"}),", ",(0,s.jsx)(n.code,{children:"Perl"}),", csv (for Excel to open), PDF files, etc. Try to ask it for anythiing on top of your mind \ud83d\ude04, e.g., ",(0,s.jsx)(n.em,{children:"'what is the problem with my Perl code?'"}),", ",(0,s.jsx)(n.em,{children:"'where is the bug in my Java file?'"})," etc.\n",(0,s.jsx)(n.img,{alt:"ChatGPT Code Interpreter",src:i(8865).Z+"",width:"582",height:"696"}),"\n",(0,s.jsx)(n.img,{alt:"ChatGPT upload files",src:i(3525).Z+"",width:"1638",height:"262"})]}),"\n",(0,s.jsxs)(n.li,{children:["It's a bunch of fun to play the plugins, for examples:\n",(0,s.jsx)(n.img,{alt:"ChatGPT plugins",src:i(6770).Z+"",width:"2304",height:"1214"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:"WebPilot"}),"\n",(0,s.jsx)(n.li,{children:"Zapier"}),"\n",(0,s.jsx)(n.li,{children:"Expedia, Kayak,"}),"\n",(0,s.jsx)(n.li,{children:"AskYourPDF"}),"\n",(0,s.jsx)(n.li,{children:"Youtube Summary, VoxScript, Video Insights (or search with keyword Youtube)"}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.li,{children:'Don\'t forget to check the bottom line, the "ChatGPT xxxxxx version" link, you may find more tricks in the change log to play with.'}),"\n",(0,s.jsxs)(n.li,{children:["you can ",(0,s.jsx)(n.a,{href:"https://platform.openai.com/docs/plugins/introduction",children:"install your own plugins"})," as well."]}),"\n"]})]}),"\n",(0,s.jsx)(n.h4,{id:"ai-agents",children:"AI Agents"}),"\n",(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsxs)(n.p,{children:["AI agents become more popular and attractive to more developers than ",(0,s.jsx)(n.code,{children:"LLMs"}),".\nBe caution that these products (prototypes) are not mature yet, but it's still fun to play with them \ud83d\ude04."]})}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://github.com/Significant-Gravitas/Auto-GPT",children:"AutoGPT"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://github.com/yoheinakajima/babyagi",children:"BabyAGI"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://agentgpt.reworkd.ai/",children:"AgentGPT"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.camel-ai.org/",children:"Camel"})}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/microsoft/JARVIS",children:"MSFT Jarvis / HuggingGPT"})," | ",(0,s.jsx)(n.a,{href:"https://arxiv.org/pdf/2303.17580.pdf",children:"Paper"})," | ",(0,s.jsx)(n.a,{href:"https://huggingface.co/spaces/microsoft/HuggingGPT",children:"HuggingFace Playground"})]}),"\n",(0,s.jsxs)(n.li,{children:["Fun game: ",(0,s.jsx)(n.a,{href:"https://towardsdatascience.com/4-autonomous-ai-agents-you-need-to-know-d612a643fa92",children:"Westworld"})]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"txt2img",children:(0,s.jsx)(n.code,{children:"Txt2Img"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"Use text to generate images"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["the best products - only 2:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.midjourney.com/app/",children:"MidJourney"})," - ",(0,s.jsx)(n.a,{href:"https://www.midjourney.com/account/",children:"paid plan"}),"\n",(0,s.jsx)(C._F,{youTubeId:"G6FjxnO437c"}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["open source model ",(0,s.jsx)(n.a,{href:"https://stablediffusionweb.com/",children:"Stable Diffusion"}),"\n",(0,s.jsx)(C._F,{youTubeId:"kqXpAKVQDNU"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["prompt and ",(0,s.jsx)(n.code,{children:"checkpoint"})," sites:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://prompthero.com/",children:"PromptHero"})}),"\n",(0,s.jsxs)(n.li,{children:["famous ",(0,s.jsx)(n.a,{href:"https://civitai.com/",children:"CiviTai"}),"\n",(0,s.jsx)(n.img,{alt:"civitai runmodel",src:i(9277).Z+"",width:"2772",height:"1416"}),"\n",(0,s.jsx)(n.img,{alt:"civitai runmodel selection",src:i(6216).Z+"",width:"2744",height:"1456"})]}),"\n",(0,s.jsx)(n.li,{children:"more online playing websites will be discovered \u2764\ufe0f"}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["a few playing projects or sites:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/AUTOMATIC1111/stable-diffusion-webui",children:"SD WebUI"})," open sourced"]}),"\n",(0,s.jsxs)(n.li,{children:["DIY and play your own hosting server: ",(0,s.jsx)(n.a,{href:"https://app.rundiffusion.com?ref=web9ai15",children:"Run Diffusion"})]}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.adobe.com/ca/sensei/generative-ai/firefly.html",children:"Adobe Firefly"}),", btw, great transformation, ",(0,s.jsx)(n.a,{href:"https://www.adobe.com/ca/sensei.html",children:"Adobe"}),"!!!"]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://labs.openai.com/",children:"OpenAI"})," and Bing(",(0,s.jsx)(n.a,{href:"https://www.microsoft.com/en-us/edge/download",children:"Download Microsoft Edge browser"}),") also provide ",(0,s.jsx)(n.a,{href:"https://openai.com/dall-e-2",children:"Dall-E 2"})," model \ud83d\udc4e but we are waiting for Dall-E 3"]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"txt2voice",children:(0,s.jsx)(n.code,{children:"Txt2Voice"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"use text to generate voice, and visa versa"}),"\n"]}),"\n",(0,s.jsxs)(T,{children:[(0,s.jsx)(k,{value:"txt2voice",label:"Txt2Voice",children:(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["popular open source projects:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/suno-ai/bark",children:"Bark"}),"\n",(0,s.jsx)(C._F,{youTubeId:"lDeeSjShilQ"}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["Chinese txt2voice services:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://ai.baidu.com/tech/speech/tts",children:"Baidu"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://global.xfyun.cn/products/online_tts",children:"XunFei"})}),"\n"]}),"\n"]}),"\n"]})}),(0,s.jsxs)(k,{value:"music",label:"Music",children:[(0,s.jsx)(n.admonition,{type:"info",children:(0,s.jsxs)(n.p,{children:[(0,s.jsx)(n.strong,{children:"Meta AudioCraft"}),"\nnot very mature technology but fun to play, and ",(0,s.jsx)(n.strong,{children:"not commercially"})," ready yet."]})}),(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/facebookresearch/audiocraft",children:"Meta AudioCraft"})," uses ",(0,s.jsx)(n.a,{href:"https://github.com/facebookresearch/audiocraft/blob/main/docs/MUSICGEN.md",children:"Meta MusicGen"}),"\n",(0,s.jsx)(C._F,{youTubeId:"map22OdIUp8"}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["another playgrounds","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://replicate.com/pollinations/music-gen",children:"Replicate Spaces"})," (pay per use)"]}),"\n"]}),"\n"]}),"\n"]})]}),(0,s.jsx)(k,{value:"voice2txt",label:"Voice2Txt",children:(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:['you can easily run the OpenAI open source "Voice to Text" model, ',(0,s.jsx)(n.a,{href:"https://github.com/openai/whisper",children:"Whisper"}),", to convert any audio file to subtitle"]}),"\n",(0,s.jsxs)(n.li,{children:["alternatively you can run it in some cloud, e.g., ",(0,s.jsx)(n.a,{href:"https://replicate.ai/openai/whisper",children:"Replicate"})," (pay per use)"]}),"\n"]})})]}),"\n",(0,s.jsx)(n.h3,{id:"voice2voice",children:(0,s.jsx)(n.code,{children:"Voice2Voice"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"use one voice to generate another voice"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["popular open source projects:","\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/svc-develop-team/so-vits-svc",children:"so-vits-svc"}),"\n",(0,s.jsx)(C._F,{youTubeId:"tZn0lcGO5OQ"}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"txt2video",children:(0,s.jsx)(n.code,{children:"Txt2Video"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"use text to generate video"}),"\n"]}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["Currently ",(0,s.jsx)(n.a,{href:"https://research.runwayml.com/gen2",children:"Runway Gen2"})," is providing the best services (few min free)","\n",(0,s.jsx)(C._F,{youTubeId:"trXPfpV5iRQ"}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"digital-character",children:(0,s.jsx)(n.code,{children:"Digital Character"})}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"this technology is not mature yet, but it's still fun to play some famous products:"}),"\n"]}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.d-id.com/",children:"d-id"}),"\n",(0,s.jsx)(n.img,{alt:"d-id",src:i(7257).Z+"",width:"2880",height:"1602"})]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://app.heygen.com/guest/templates?cid=5e24983e",children:"HeyGen"}),"\n",(0,s.jsx)(n.img,{alt:"heygen",src:i(7907).Z+"",width:"2824",height:"1472"})]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"programming-code",children:"Programming Code"}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsxs)(n.p,{children:["plugins integrated into modern IDEs to help you write code (",(0,s.jsx)(n.a,{href:"https://code.visualstudio.com/",children:"VsCode"}),", ",(0,s.jsx)(n.a,{href:"https://www.jetbrains.com/idea/",children:"IntelliJ"}),", etc.)"]}),"\n"]}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://github.com/features/copilot",children:"Github Copilot"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsxs)(n.p,{children:["Future -> ",(0,s.jsx)(n.a,{href:"https://github.com/features/preview/copilot-x",children:"Github Copilot X"})]})}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://www.cursor.so/",children:"Open Source Cursor"})," helps you write code in browser"]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"learning-resources",children:"Learning Resources"}),"\n",(0,s.jsxs)(n.blockquote,{children:["\n",(0,s.jsx)(n.p,{children:"Popular learning resources to suggested:"}),"\n"]}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsxs)(n.p,{children:[(0,s.jsx)(n.a,{href:"../prompt-guides",children:"Web9AI Prompt Engineering Guides"}),"."]}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsx)(n.p,{children:"Hightlights"})}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-openai-api",children:"OpenAI Best Practices"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.promptingguide.ai/",children:"Prompt Engineering Guide"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://learn.microsoft.com/en-us/azure/cognitive-services/openai/concepts/advanced-prompt-engineering?pivots=programming-language-chat-completions#specifying-the-output-structure",children:"Microsoft Prompt engineering techniques"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/",children:"Prompt Engineering by Lilian Weng"})}),"\n"]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsx)(n.p,{children:(0,s.jsx)(n.a,{href:"https://www.deeplearning.ai/short-courses/",children:"Andrew Ng AI courses"})}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.h2,{id:"popular-playgrounds",children:"Popular Playgrounds"}),"\n",(0,s.jsx)(n.admonition,{type:"tip",children:(0,s.jsx)(n.p,{children:"Few famous playgrounds to play with different models for free, in case if you don't have a good GPU."})}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://huggingface.co/spaces",children:"HuggingFace"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://replicate.com/explore",children:"Replicate"})}),"\n"]})]})}const D=function(e={}){const{wrapper:n}=Object.assign({},(0,t.ah)(),e.components);return n?(0,s.jsx)(n,Object.assign({},e,{children:(0,s.jsx)(S,e)})):S(e)}},8865:(e,n,i)=>{i.d(n,{Z:()=>s});const s=i.p+"assets/images/chatgpt-models-1e7c4dc2fcdb783ead4fabd176af5347.png"},6770:(e,n,i)=>{i.d(n,{Z:()=>s});const s=i.p+"assets/images/chatgpt-plugins-ae2dbb99ee324232dd04b71bc5f1ada9.png"},3525:(e,n,i)=>{i.d(n,{Z:()=>s});const s=i.p+"assets/images/chatgpt-upload_file-092a0a71ea5b87955440be59880da922.png"},6216:(e,n,i)=>{i.d(n,{Z:()=>s});const s=i.p+"assets/images/civitai-runmodel-selection-3486df6ce3988513032500dff95f7169.png"},9277:(e,n,i)=>{i.d(n,{Z:()=>s});const s=i.p+"assets/images/civitai-runmodel-e07f4ce976c8017cb73c876cd3fcd425.png"},7257:(e,n,i)=>{i.d(n,{Z:()=>s});const s=i.p+"assets/images/d-id-4f2ba3c2e9dd4fe6b48beefb031e97c1.png"},7907:(e,n,i)=>{i.d(n,{Z:()=>s});const s=i.p+"assets/images/heygen-0a70d2ecab0ba0bf075a3f5d2ed4ff85.png"}}]);