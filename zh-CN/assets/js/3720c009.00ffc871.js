"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[3751],{727:(e,t,a)=>{a.r(t),a.d(t,{default:()=>p});var l=a(7462),n=a(7294),r=a(6010),c=a(1944),s=a(5281),m=a(5155),i=a(6090),g=a(197),o=a(2503);function u(e){let{title:t}=e;return n.createElement(n.Fragment,null,n.createElement(c.d,{title:t}),n.createElement(g.Z,{tag:"doc_tags_list"}))}function E(e){let{tags:t,title:a}=e;return n.createElement(c.FG,{className:(0,r.Z)(s.k.page.docsTagsListPage)},n.createElement("div",{className:"container margin-vert--lg"},n.createElement("div",{className:"row"},n.createElement("main",{className:"col col--8 col--offset-2"},n.createElement(o.Z,{as:"h1"},a),n.createElement(i.Z,{tags:t})))))}function p(e){const t=(0,m.M)();return n.createElement(n.Fragment,null,n.createElement(u,(0,l.Z)({},e,{title:t})),n.createElement(E,(0,l.Z)({},e,{title:t})))}},3008:(e,t,a)=>{a.d(t,{Z:()=>s});var l=a(7294),n=a(6010),r=a(9960);const c={tag:"tag_zVej",tagRegular:"tagRegular_sFm0",tagWithCount:"tagWithCount_h2kH"};function s(e){let{permalink:t,label:a,count:s}=e;return l.createElement(r.Z,{href:t,className:(0,n.Z)(c.tag,s?c.tagWithCount:c.tagRegular)},a,s&&l.createElement("span",null,s))}},6090:(e,t,a)=>{a.d(t,{Z:()=>i});var l=a(7294),n=a(5155),r=a(3008),c=a(2503);const s={tag:"tag_Nnez"};function m(e){let{letterEntry:t}=e;return l.createElement("article",null,l.createElement(c.Z,{as:"h2",id:t.letter},t.letter),l.createElement("ul",{className:"padding--none"},t.tags.map((e=>l.createElement("li",{key:e.permalink,className:s.tag},l.createElement(r.Z,e))))),l.createElement("hr",null))}function i(e){let{tags:t}=e;const a=(0,n.P)(t);return l.createElement("section",{className:"margin-vert--lg"},a.map((e=>l.createElement(m,{key:e.letter,letterEntry:e}))))}},5155:(e,t,a)=>{a.d(t,{M:()=>n,P:()=>r});var l=a(5999);const n=()=>(0,l.I)({id:"theme.tags.tagsPageTitle",message:"Tags",description:"The title of the tag list page"});function r(e){const t={};return Object.values(e).forEach((e=>{const a=function(e){return e[0].toUpperCase()}(e.label);t[a]??=[],t[a].push(e)})),Object.entries(t).sort(((e,t)=>{let[a]=e,[l]=t;return a.localeCompare(l)})).map((e=>{let[t,a]=e;return{letter:t,tags:a.sort(((e,t)=>e.label.localeCompare(t.label)))}}))}}}]);