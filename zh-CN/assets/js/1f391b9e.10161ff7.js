"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[3085],{4247:(e,n,t)=>{t.r(n),t.d(n,{default:()=>u});var l=t(7294),a=t(6010),r=t(1944),i=t(5281),c=t(1155),o=t(2164),s=t(9407),m=t(2212);const d={mdxPageWrapper:"mdxPageWrapper_j9I6"};function u(e){const{content:n}=e,{metadata:{title:t,description:u,frontMatter:f,unlisted:v}}=n,{wrapperClassName:g,hide_table_of_contents:h}=f;return l.createElement(r.FG,{className:(0,a.Z)(g??i.k.wrapper.mdxPages,i.k.page.mdxPage)},l.createElement(r.d,{title:t,description:u}),l.createElement(c.Z,null,l.createElement("main",{className:"container container--fluid margin-vert--lg"},l.createElement("div",{className:(0,a.Z)("row",d.mdxPageWrapper)},l.createElement("div",{className:(0,a.Z)("col",!h&&"col--8")},v&&l.createElement(m.Z,null),l.createElement("article",null,l.createElement(o.Z,null,l.createElement(n,null)))),!h&&n.toc.length>0&&l.createElement("div",{className:"col col--2"},l.createElement(s.Z,{toc:n.toc,minHeadingLevel:f.toc_min_heading_level,maxHeadingLevel:f.toc_max_heading_level}))))))}},9407:(e,n,t)=>{t.d(n,{Z:()=>m});var l=t(7462),a=t(7294),r=t(6010),i=t(3743);const c={tableOfContents:"tableOfContents_bqdL",docItemContainer:"docItemContainer_F8PC"},o="table-of-contents__link toc-highlight",s="table-of-contents__link--active";function m(e){let{className:n,...t}=e;return a.createElement("div",{className:(0,r.Z)(c.tableOfContents,"thin-scrollbar",n)},a.createElement(i.Z,(0,l.Z)({},t,{linkClassName:o,linkActiveClassName:s})))}},3743:(e,n,t)=>{t.d(n,{Z:()=>g});var l=t(7462),a=t(7294),r=t(6668);function i(e){const n=e.map((e=>({...e,parentIndex:-1,children:[]}))),t=Array(7).fill(-1);n.forEach(((e,n)=>{const l=t.slice(2,e.level);e.parentIndex=Math.max(...l),t[e.level]=n}));const l=[];return n.forEach((e=>{const{parentIndex:t,...a}=e;t>=0?n[t].children.push(a):l.push(a)})),l}function c(e){let{toc:n,minHeadingLevel:t,maxHeadingLevel:l}=e;return n.flatMap((e=>{const n=c({toc:e.children,minHeadingLevel:t,maxHeadingLevel:l});return function(e){return e.level>=t&&e.level<=l}(e)?[{...e,children:n}]:n}))}function o(e){const n=e.getBoundingClientRect();return n.top===n.bottom?o(e.parentNode):n}function s(e,n){let{anchorTopOffset:t}=n;const l=e.find((e=>o(e).top>=t));if(l){return function(e){return e.top>0&&e.bottom<window.innerHeight/2}(o(l))?l:e[e.indexOf(l)-1]??null}return e[e.length-1]??null}function m(){const e=(0,a.useRef)(0),{navbar:{hideOnScroll:n}}=(0,r.L)();return(0,a.useEffect)((()=>{e.current=n?0:document.querySelector(".navbar").clientHeight}),[n]),e}function d(e){const n=(0,a.useRef)(void 0),t=m();(0,a.useEffect)((()=>{if(!e)return()=>{};const{linkClassName:l,linkActiveClassName:a,minHeadingLevel:r,maxHeadingLevel:i}=e;function c(){const e=function(e){return Array.from(document.getElementsByClassName(e))}(l),c=function(e){let{minHeadingLevel:n,maxHeadingLevel:t}=e;const l=[];for(let a=n;a<=t;a+=1)l.push(`h${a}.anchor`);return Array.from(document.querySelectorAll(l.join()))}({minHeadingLevel:r,maxHeadingLevel:i}),o=s(c,{anchorTopOffset:t.current}),m=e.find((e=>o&&o.id===function(e){return decodeURIComponent(e.href.substring(e.href.indexOf("#")+1))}(e)));e.forEach((e=>{!function(e,t){t?(n.current&&n.current!==e&&n.current.classList.remove(a),e.classList.add(a),n.current=e):e.classList.remove(a)}(e,e===m)}))}return document.addEventListener("scroll",c),document.addEventListener("resize",c),c(),()=>{document.removeEventListener("scroll",c),document.removeEventListener("resize",c)}}),[e,t])}var u=t(9960);function f(e){let{toc:n,className:t,linkClassName:l,isChild:r}=e;return n.length?a.createElement("ul",{className:r?void 0:t},n.map((e=>a.createElement("li",{key:e.id},a.createElement(u.Z,{to:`#${e.id}`,className:l??void 0,dangerouslySetInnerHTML:{__html:e.value}}),a.createElement(f,{isChild:!0,toc:e.children,className:t,linkClassName:l}))))):null}const v=a.memo(f);function g(e){let{toc:n,className:t="table-of-contents table-of-contents__left-border",linkClassName:o="table-of-contents__link",linkActiveClassName:s,minHeadingLevel:m,maxHeadingLevel:u,...f}=e;const g=(0,r.L)(),h=m??g.tableOfContents.minHeadingLevel,E=u??g.tableOfContents.maxHeadingLevel,p=function(e){let{toc:n,minHeadingLevel:t,maxHeadingLevel:l}=e;return(0,a.useMemo)((()=>c({toc:i(n),minHeadingLevel:t,maxHeadingLevel:l})),[n,t,l])}({toc:n,minHeadingLevel:h,maxHeadingLevel:E});return d((0,a.useMemo)((()=>{if(o&&s)return{linkClassName:o,linkActiveClassName:s,minHeadingLevel:h,maxHeadingLevel:E}}),[o,s,h,E])),a.createElement(v,(0,l.Z)({toc:p,className:t,linkClassName:o},f))}},2212:(e,n,t)=>{t.d(n,{Z:()=>f});var l=t(7294),a=t(6010),r=t(5999),i=t(5742);function c(){return l.createElement(r.Z,{id:"theme.unlistedContent.title",description:"The unlisted content banner title"},"Unlisted page")}function o(){return l.createElement(r.Z,{id:"theme.unlistedContent.message",description:"The unlisted content banner message"},"This page is unlisted. Search engines will not index it, and only users having a direct link can access it.")}function s(){return l.createElement(i.Z,null,l.createElement("meta",{name:"robots",content:"noindex, nofollow"}))}var m=t(5281),d=t(6782);function u(e){let{className:n}=e;return l.createElement(d.Z,{type:"caution",title:l.createElement(c,null),className:(0,a.Z)(n,m.k.common.unlistedBanner)},l.createElement(o,null))}function f(e){return l.createElement(l.Fragment,null,l.createElement(s,null),l.createElement(u,e))}}}]);