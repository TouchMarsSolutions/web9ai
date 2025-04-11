/*! For license information please see 215.d7639176.js.LICENSE.txt */
"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[215],{4829:(e,t)=>{t.__esModule=!0,t.loadStates=t.icons=void 0;const n="loading",o="loaded",r="error";t.icons={load:"load",loading:n,loaded:o,error:r,noicon:"noicon",offline:"offline"},t.loadStates={initial:"initial",loading:n,loaded:o,error:r}},8719:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o=i(n(96540)),r=i(n(96272));function i(e){return e&&e.__esModule?e:{default:e}}function s(){return s=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)({}).hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},s.apply(null,arguments)}t.default=e=>o.default.createElement(r.default,s({},e,{path:"M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z"}))},23286:(e,t,n)=>{e.exports=n(37210)},28453:(e,t,n)=>{n.d(t,{R:()=>s,x:()=>a});var o=n(96540);const r={},i=o.createContext(r);function s(e){const t=o.useContext(i);return o.useMemo((function(){return"function"==typeof e?e(t):{...t,...e}}),[t,e])}function a(e){let t;return t=e.disableParentContext?"function"==typeof e.components?e.components(r):e.components||r:s(e.components),o.createElement(i.Provider,{value:t},e.children)}},31080:(e,t,n)=>{t.__esModule=!0,t.xhrLoader=t.timeout=t.imageLoader=t.combineCancel=void 0;var o=n(38929);function r(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);t&&(o=o.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),n.push.apply(n,o)}return n}function i(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{};t%2?r(Object(n),!0).forEach((function(t){s(e,t,n[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):r(Object(n)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))}))}return e}function s(e,t,n){return(t=function(e){var t=function(e,t){if("object"!=typeof e||!e)return e;var n=e[Symbol.toPrimitive];if(void 0!==n){var o=n.call(e,t||"default");if("object"!=typeof o)return o;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===t?String:Number)(e)}(e,"string");return"symbol"==typeof t?t:t+""}(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}t.combineCancel=(e,t)=>{if(!t)return e;const n=e.then((e=>e),(e=>e));return n.cancel=()=>{e.cancel(),t.cancel()},n};t.timeout=e=>{let t;const n=new Promise((n=>{t=setTimeout(n,e)}));return n.cancel=()=>{clearTimeout(t),t=void 0},n};const a=e=>{let t=new Image;const n=new Promise(((n,o)=>{t.onload=n,t.onabort=t.onerror=()=>o({}),t.src=e}));return n.cancel=()=>{if(!t)throw new Error("Already canceled");t.onload=t.onabort=t.onerror=void 0,t.src="",t=void 0},n};t.imageLoader=a;t.xhrLoader=(e,t)=>{let n=new o.UnfetchAbortController;const r=n.signal,s=new Promise(((n,s)=>(0,o.unfetch)(e,i(i({},t),{},{signal:r})).then((t=>{t.ok?t.blob().then((()=>a(e))).then(n):s({status:t.status})}),s)));return s.cancel=()=>{if(!n)throw new Error("Already canceled");n.abort(),n=void 0},s}},31874:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o=l(n(87498)),r=l(n(8719)),i=l(n(72612)),s=l(n(52692)),a=n(4829);function l(e){return e&&e.__esModule?e:{default:e}}const{load:c,loading:u,loaded:d,error:f,noicon:p,offline:h}=a.icons;t.default={[c]:o.default,[u]:s.default,[d]:null,[f]:i.default,[p]:null,[h]:r.default}},32155:(e,t)=>{t.__esModule=!0,t.default=void 0;t.default=function(){const e=[];let t;for(var n=arguments.length,o=new Array(n),r=0;r<n;r++)o[r]=arguments[r];for(const i of o)if(i instanceof Object)Object.assign(t||(t={}),i);else if(void 0===i||!1===i);else{if("string"!=typeof i)throw new Error("Unexpected value "+i);e.push(i)}return{className:e.length>1?e.join(" "):e[0],style:t}}},37210:(e,t)=>{var n,o=Symbol.for("react.element"),r=Symbol.for("react.portal"),i=Symbol.for("react.fragment"),s=Symbol.for("react.strict_mode"),a=Symbol.for("react.profiler"),l=Symbol.for("react.provider"),c=Symbol.for("react.context"),u=Symbol.for("react.server_context"),d=Symbol.for("react.forward_ref"),f=Symbol.for("react.suspense"),p=Symbol.for("react.suspense_list"),h=Symbol.for("react.memo"),v=Symbol.for("react.lazy"),m=Symbol.for("react.offscreen");function g(e){if("object"==typeof e&&null!==e){var t=e.$$typeof;switch(t){case o:switch(e=e.type){case i:case a:case s:case f:case p:return e;default:switch(e=e&&e.$$typeof){case u:case c:case d:case v:case h:case l:return e;default:return t}}case r:return t}}}n=Symbol.for("react.module.reference"),t.isForwardRef=function(e){return g(e)===d}},38929:(e,t)=>{t.__esModule=!0,t.unfetch=t.UnfetchAbortController=void 0;t.UnfetchAbortController=class{constructor(){this.signal={onabort:()=>{}},this.abort=()=>this.signal.onabort()}};t.unfetch=(e,t)=>(t=t||{},new Promise(((n,o)=>{const r=new XMLHttpRequest;r.open(t.method||"get",e,!0);for(const e in t.headers)r.setRequestHeader(e,t.headers[e]);function i(){const e=[],t=[],n={};let o;return r.getAllResponseHeaders().replace(/^(.*?):\s*?([\s\S]*?)$/gm,((r,i,s)=>{e.push(i=i.toLowerCase()),t.push([i,s]),o=n[i],n[i]=o?o+","+s:s})),{ok:2==(r.status/100|0),status:r.status,statusText:r.statusText,url:r.responseURL,clone:i,text:()=>Promise.resolve(r.responseText),json:()=>Promise.resolve(r.responseText).then(JSON.parse),blob:()=>Promise.resolve(new Blob([r.response])),headers:{keys:()=>e,entries:()=>t,get:e=>n[e.toLowerCase()],has:e=>e.toLowerCase()in n}}}r.withCredentials="include"===t.credentials,r.onload=()=>{n(i())},r.onerror=o,t.signal&&(t.signal.onabort=()=>{r.onerror=r.onload=void 0,r.abort()}),r.send(t.body)})))},45685:(e,t)=>{t.__esModule=!0,t.supportsWebp=t.ssr=t.selectSrc=t.nativeConnection=t.guessMaxImageWidth=t.fallbackParams=t.bytesToSize=void 0;const n=t.ssr="undefined"==typeof window||"ReactSnap"===window.navigator.userAgent;t.nativeConnection=!n&&!!window.navigator.connection;t.guessMaxImageWidth=(e,t)=>{if(n)return 0;t||(t=window);const o=e.width,{screen:r}=t,i=r.width,s=r.height,{documentElement:a}=document,l=t.innerWidth||a.clientWidth,c=t.innerHeight||a.clientHeight,u=t.devicePixelRatio||1;let d;if(i>l){const e=document.getElementsByTagName("body")[0],t=l-o;d=(e.clientHeight>c||e.clientHeight>s)&&t<=15?i-t:o/l*i}else d=o;return d*u};t.bytesToSize=e=>{const t=["Bytes","KB","MB","GB","TB"];if(0===e)return"n/a";const n=parseInt(Math.floor(Math.log(e)/Math.log(1024)),10);return 0===n?e+" "+t[n]:(e/1024**n).toFixed(1)+" "+t[n]};t.supportsWebp=(()=>{if(n)return!1;const e=document.createElement("canvas");return!(!e.getContext||!e.getContext("2d"))&&0===e.toDataURL("image/webp").indexOf("data:image/webp")})();const o=e=>"webp"===e.format||e.src&&e.src.match(/\.webp($|\?.*)/i);t.selectSrc=e=>{let t,n,{srcSet:r,maxImageWidth:i,supportsWebp:s}=e;if(0===r.length)throw new Error("Need at least one item in srcSet");if(s)t=r.filter(o),0===t.length&&(t=r);else if(t=r.filter((e=>!o(e))),0===t.length)throw new Error("Need at least one supported format item in srcSet");let a=t.filter((e=>e.width>=i));return 0===a.length?(a=t,n=Math.max.apply(null,a.map((e=>e.width)))):n=Math.min.apply(null,a.map((e=>e.width))),t.filter((e=>e.width===n))[0]};t.fallbackParams=e=>{let{srcSet:t,getUrl:r}=e;if(!n)return{};const i=t.filter((e=>!o(e))),s=i[0];return{nsSrcSet:i.map((e=>(r?r(e):e.src)+" "+e.width+"w")).join(","),nsSrc:r?r(s):s.src,ssr:n}}},52692:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o=i(n(96540)),r=i(n(96272));function i(e){return e&&e.__esModule?e:{default:e}}function s(){return s=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)({}).hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},s.apply(null,arguments)}t.default=e=>o.default.createElement(r.default,s({},e,{path:"M6,2V8H6V8L10,12L6,16V16H6V22H18V16H18V16L14,12L18,8V8H18V2H6M16,16.5V20H8V16.5L12,12.5L16,16.5M12,11.5L8,7.5V4H16V7.5L12,11.5Z"}))},55781:(e,t)=>{t.__esModule=!0,t.default=void 0;t.default={placeholder:{backgroundSize:"cover",backgroundRepeat:"no-repeat",position:"relative"},img:{width:"100%",height:"auto",maxWidth:"100%",marginBottom:"-4px"},icon:{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%, -50%)",textAlign:"center"},noscript:{position:"absolute",top:0,left:0}}},59890:(e,t,n)=>{n.r(t),n.d(t,{Waypoint:()=>_});var o=n(42892),r=!("undefined"==typeof window||!window.document||!window.document.createElement);var i=void 0;function s(){return void 0===i&&(i=function(){if(!r)return!1;if(!window.addEventListener||!window.removeEventListener||!Object.defineProperty)return!1;var e=!1;try{var t=Object.defineProperty({},"passive",{get:function(){e=!0}}),n=function(){};window.addEventListener("testPassiveEventSupport",n,t),window.removeEventListener("testPassiveEventSupport",n,t)}catch(o){}return e}()),i}function a(e){e.handlers===e.nextHandlers&&(e.nextHandlers=e.handlers.slice())}function l(e){this.target=e,this.events={}}l.prototype.getEventHandlers=function(e,t){var n,o=String(e)+" "+String((n=t)?!0===n?100:(0|n.capture)+(n.passive<<1)+(n.once<<2):0);return this.events[o]||(this.events[o]={handlers:[],handleEvent:void 0},this.events[o].nextHandlers=this.events[o].handlers),this.events[o]},l.prototype.handleEvent=function(e,t,n){var o=this.getEventHandlers(e,t);o.handlers=o.nextHandlers,o.handlers.forEach((function(e){e&&e(n)}))},l.prototype.add=function(e,t,n){var o=this,r=this.getEventHandlers(e,n);a(r),0===r.nextHandlers.length&&(r.handleEvent=this.handleEvent.bind(this,e,n),this.target.addEventListener(e,r.handleEvent,n)),r.nextHandlers.push(t);var i=!0;return function(){if(i){i=!1,a(r);var s=r.nextHandlers.indexOf(t);r.nextHandlers.splice(s,1),0===r.nextHandlers.length&&(o.target&&o.target.removeEventListener(e,r.handleEvent,n),r.handleEvent=void 0)}}};var c="__consolidated_events_handlers__";function u(e,t,n,o){e[c]||(e[c]=new l(e));var r=function(e){if(e)return s()?e:!!e.capture}(o);return e[c].add(t,n,r)}var d=n(96540),f=n(23286);function p(e,t){var n,o=(n=e,!isNaN(parseFloat(n))&&isFinite(n)?parseFloat(n):"px"===n.slice(-2)?parseFloat(n.slice(0,-2)):void 0);if("number"==typeof o)return o;var r=function(e){if("%"===e.slice(-1))return parseFloat(e.slice(0,-1))/100}(e);return"number"==typeof r?r*t:void 0}var h="above",v="inside",m="below",g="invisible";function w(e){return"string"==typeof e.type}var b;var y=[];function S(e){y.push(e),b||(b=setTimeout((function(){var e;for(b=null;e=y.shift();)e()}),0));var t=!0;return function(){if(t){t=!1;var n=y.indexOf(e);-1!==n&&(y.splice(n,1),!y.length&&b&&(clearTimeout(b),b=null))}}}var O="undefined"!=typeof window,E={debug:!1,scrollableAncestor:void 0,children:void 0,topOffset:"0px",bottomOffset:"0px",horizontal:!1,onEnter:function(){},onLeave:function(){},onPositionChange:function(){},fireOnRapidScroll:!0},_=function(e){function t(t){var n;return(n=e.call(this,t)||this).refElement=function(e){n._ref=e},n}(0,o.A)(t,e);var r=t.prototype;return r.componentDidMount=function(){var e=this;O&&(this.cancelOnNextTick=S((function(){e.cancelOnNextTick=null;var t=e.props,n=t.children;t.debug;!function(e,t){if(e&&!w(e)&&!t)throw new Error("<Waypoint> needs a DOM element to compute boundaries. The child you passed is neither a DOM element (e.g. <div>) nor does it use the innerRef prop.\n\nSee https://goo.gl/LrBNgw for more info.")}(n,e._ref),e._handleScroll=e._handleScroll.bind(e),e.scrollableAncestor=e._findScrollableAncestor(),e.scrollEventListenerUnsubscribe=u(e.scrollableAncestor,"scroll",e._handleScroll,{passive:!0}),e.resizeEventListenerUnsubscribe=u(window,"resize",e._handleScroll,{passive:!0}),e._handleScroll(null)})))},r.componentDidUpdate=function(){var e=this;O&&this.scrollableAncestor&&(this.cancelOnNextTick||(this.cancelOnNextTick=S((function(){e.cancelOnNextTick=null,e._handleScroll(null)}))))},r.componentWillUnmount=function(){O&&(this.scrollEventListenerUnsubscribe&&this.scrollEventListenerUnsubscribe(),this.resizeEventListenerUnsubscribe&&this.resizeEventListenerUnsubscribe(),this.cancelOnNextTick&&this.cancelOnNextTick())},r._findScrollableAncestor=function(){var e=this.props,t=e.horizontal,o=e.scrollableAncestor;if(o)return function(e){return"window"===e?n.g.window:e}(o);for(var r=this._ref;r.parentNode;){if((r=r.parentNode)===document.body)return window;var i=window.getComputedStyle(r),s=(t?i.getPropertyValue("overflow-x"):i.getPropertyValue("overflow-y"))||i.getPropertyValue("overflow");if("auto"===s||"scroll"===s||"overlay"===s)return r}return window},r._handleScroll=function(e){if(this._ref){var t=this._getBounds(),n=function(e){return e.viewportBottom-e.viewportTop==0?g:e.viewportTop<=e.waypointTop&&e.waypointTop<=e.viewportBottom||e.viewportTop<=e.waypointBottom&&e.waypointBottom<=e.viewportBottom||e.waypointTop<=e.viewportTop&&e.viewportBottom<=e.waypointBottom?v:e.viewportBottom<e.waypointTop?m:e.waypointTop<e.viewportTop?h:g}(t),o=this._previousPosition,r=this.props,i=(r.debug,r.onPositionChange),s=r.onEnter,a=r.onLeave,l=r.fireOnRapidScroll;if(this._previousPosition=n,o!==n){var c={currentPosition:n,previousPosition:o,event:e,waypointTop:t.waypointTop,waypointBottom:t.waypointBottom,viewportTop:t.viewportTop,viewportBottom:t.viewportBottom};i.call(this,c),n===v?s.call(this,c):o===v&&a.call(this,c),l&&(o===m&&n===h||o===h&&n===m)&&(s.call(this,{currentPosition:v,previousPosition:o,event:e,waypointTop:t.waypointTop,waypointBottom:t.waypointBottom,viewportTop:t.viewportTop,viewportBottom:t.viewportBottom}),a.call(this,{currentPosition:n,previousPosition:v,event:e,waypointTop:t.waypointTop,waypointBottom:t.waypointBottom,viewportTop:t.viewportTop,viewportBottom:t.viewportBottom}))}}},r._getBounds=function(){var e,t,n=this.props,o=n.horizontal,r=(n.debug,this._ref.getBoundingClientRect()),i=r.left,s=r.top,a=r.right,l=r.bottom,c=o?i:s,u=o?a:l;this.scrollableAncestor===window?(e=o?window.innerWidth:window.innerHeight,t=0):(e=o?this.scrollableAncestor.offsetWidth:this.scrollableAncestor.offsetHeight,t=o?this.scrollableAncestor.getBoundingClientRect().left:this.scrollableAncestor.getBoundingClientRect().top);var d=this.props,f=d.bottomOffset;return{waypointTop:c,waypointBottom:u,viewportTop:t+p(d.topOffset,e),viewportBottom:t+e-p(f,e)}},r.render=function(){var e=this,t=this.props.children;if(!t)return d.createElement("span",{ref:this.refElement,style:{fontSize:0}});if(w(t)||(0,f.isForwardRef)(t)){return d.cloneElement(t,{ref:function(n){e.refElement(n),t.ref&&("function"==typeof t.ref?t.ref(n):t.ref.current=n)}})}return d.cloneElement(t,{innerRef:this.refElement})},t}(d.PureComponent);_.above=h,_.below=m,_.inside=v,_.invisible=g,_.defaultProps=E,_.displayName="Waypoint"},60915:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o,r=function(e,t){if(!t&&e&&e.__esModule)return e;if(null===e||"object"!=typeof e&&"function"!=typeof e)return{default:e};var n=u(t);if(n&&n.has(e))return n.get(e);var o={__proto__:null},r=Object.defineProperty&&Object.getOwnPropertyDescriptor;for(var i in e)if("default"!==i&&{}.hasOwnProperty.call(e,i)){var s=r?Object.getOwnPropertyDescriptor(e,i):null;s&&(s.get||s.set)?Object.defineProperty(o,i,s):o[i]=e[i]}return o.default=e,n&&n.set(e,o),o}(n(96540)),i=n(59890),s=(o=n(66631))&&o.__esModule?o:{default:o},a=n(4829),l=n(31080),c=n(45685);function u(e){if("function"!=typeof WeakMap)return null;var t=new WeakMap,n=new WeakMap;return(u=function(e){return e?n:t})(e)}function d(){return d=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)({}).hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},d.apply(null,arguments)}function f(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);t&&(o=o.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),n.push.apply(n,o)}return n}function p(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{};t%2?f(Object(n),!0).forEach((function(t){h(e,t,n[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):f(Object(n)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))}))}return e}function h(e,t,n){return(t=function(e){var t=function(e,t){if("object"!=typeof e||!e)return e;var n=e[Symbol.toPrimitive];if(void 0!==n){var o=n.call(e,t||"default");if("object"!=typeof o)return o;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===t?String:Number)(e)}(e,"string");return"symbol"==typeof t?t:t+""}(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}const{initial:v,loading:m,loaded:g,error:w}=a.loadStates;class b extends r.Component{constructor(e){super(e),h(this,"onClick",(()=>{const{loadState:e,onLine:t,overThreshold:n}=this.state;if(t)switch(e){case m:return void(n&&this.cancel(!0));case g:return;case v:case w:return void this.load(!0);default:throw new Error("Wrong state: "+e)}})),h(this,"load",(e=>{const{loadState:t,url:n}=this.state;if(c.ssr||g===t||m===t)return;this.loadStateChange(m,e);const{threshold:o}=this.props,r="xhr"===this.props.loader?(0,l.xhrLoader)(n):(0,l.imageLoader)(n);if(r.then((()=>{this.clear(),this.loadStateChange(g,!1)})).catch((e=>{this.clear(),404===e.status?this.loadStateChange(w,!1,404):this.loadStateChange(w,!1)})),o){const e=(0,l.timeout)(o);e.then((()=>{this.loader&&(window.document.dispatchEvent(new CustomEvent("possiblySlowNetwork",{detail:{possiblySlowNetwork:!0}})),this.setState({overThreshold:!0}),this.state.userTriggered||this.cancel(!0))})),this.loader=(0,l.combineCancel)(r,e)}else this.loader=r})),h(this,"onEnter",(()=>{if(this.state.inViewport)return;this.setState({inViewport:!0});const e=(0,c.selectSrc)({srcSet:this.props.srcSet,maxImageWidth:this.props.srcSet.length>1?(0,c.guessMaxImageWidth)(this.state.dimensions):0,supportsWebp:c.supportsWebp}),{getUrl:t}=this.props,n=t?t(e):e.src,o=this.props.shouldAutoDownload(p(p({},this.state),{},{size:e.size}));this.setState({pickedSrc:e,shouldAutoDownload:o,url:n},(()=>{o&&this.load(!1)}))})),h(this,"onLeave",(()=>{this.state.loadState!==m||this.state.userTriggered||(this.setState({inViewport:!1}),this.cancel(!1))})),this.state={loadState:v,connection:c.nativeConnection?{downlink:navigator.connection.downlink,rtt:navigator.connection.rtt,effectiveType:navigator.connection.effectiveType}:null,onLine:!0,overThreshold:!1,inViewport:!1,userTriggered:!1,possiblySlowNetwork:!1}}componentDidMount(){c.nativeConnection?(this.updateConnection=()=>{navigator.onLine&&this.state.loadState===v&&this.setState({connection:{effectiveType:navigator.connection.effectiveType,downlink:navigator.connection.downlink,rtt:navigator.connection.rtt}})},navigator.connection.addEventListener("onchange",this.updateConnection)):this.props.threshold&&(this.possiblySlowNetworkListener=e=>{if(this.state.loadState!==v)return;const{possiblySlowNetwork:t}=e.detail;!this.state.possiblySlowNetwork&&t&&this.setState({possiblySlowNetwork:t})},window.document.addEventListener("possiblySlowNetwork",this.possiblySlowNetworkListener)),this.updateOnlineStatus=()=>this.setState({onLine:navigator.onLine}),this.updateOnlineStatus(),window.addEventListener("online",this.updateOnlineStatus),window.addEventListener("offline",this.updateOnlineStatus)}componentWillUnmount(){this.clear(),c.nativeConnection?navigator.connection.removeEventListener("onchange",this.updateConnection):this.props.threshold&&window.document.removeEventListener("possiblySlowNetwork",this.possiblySlowNetworkListener),window.removeEventListener("online",this.updateOnlineStatus),window.removeEventListener("offline",this.updateOnlineStatus)}clear(){this.loader&&(this.loader.cancel(),this.loader=void 0)}cancel(e){m===this.state.loadState&&(this.clear(),this.loadStateChange(v,e))}loadStateChange(e,t,n){void 0===n&&(n=null),this.setState({loadState:e,overThreshold:!1,userTriggered:!!t,loadInfo:n})}render(){const e=this.props.getIcon(this.state),t=this.props.getMessage(e,this.state);return r.default.createElement(i.Waypoint,{onEnter:this.onEnter,onLeave:this.onLeave},r.default.createElement(s.default,d({},this.props,(0,c.fallbackParams)(this.props),{onClick:this.onClick,icon:e,src:this.state.url||"",onDimensions:e=>this.setState({dimensions:e}),message:t})))}}t.default=b,h(b,"defaultProps",{shouldAutoDownload:e=>{let{connection:t,size:n,threshold:o,possiblySlowNetwork:r}=e;if(r)return!1;if(!t)return!0;const{downlink:i,rtt:s,effectiveType:a}=t;switch(a){case"slow-2g":case"2g":return!1;case"3g":return!!(i&&n&&o)&&8*n/(1e3*i)+s<o;default:return!0}},getMessage:(e,t)=>{switch(e){case a.icons.noicon:case a.icons.loaded:return null;case a.icons.loading:return"Loading...";case a.icons.load:const{pickedSrc:n}=t,{size:o}=n;return o?["Click to load (",r.default.createElement("nobr",{key:"nb"},(0,c.bytesToSize)(o)),")"]:"Click to load";case a.icons.offline:return"Your browser is offline. Image not loaded";case a.icons.error:const{loadInfo:i}=t;return 404===i?"404. Image not found":"Error. Click to reload";default:throw new Error("Wrong icon: "+e)}},getIcon:e=>{const{loadState:t,onLine:n,overThreshold:o,userTriggered:r}=e;if(c.ssr)return a.icons.noicon;switch(t){case g:return a.icons.loaded;case m:return o?a.icons.loading:a.icons.noicon;case v:if(n){const{shouldAutoDownload:t}=e;return void 0===t?a.icons.noicon:r||!t?a.icons.load:a.icons.noicon}return a.icons.offline;case w:return n?a.icons.error:a.icons.offline;default:throw new Error("Wrong state: "+t)}},loader:"xhr"})},66513:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o=l(n(96540)),r=l(n(60915)),i=l(n(31874)),s=l(n(55781));const a=["icons","theme"];function l(e){return e&&e.__esModule?e:{default:e}}function c(){return c=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)({}).hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},c.apply(null,arguments)}t.default=e=>{let{icons:t=i.default,theme:n=s.default}=e,l=function(e,t){if(null==e)return{};var n,o,r=function(e,t){if(null==e)return{};var n={};for(var o in e)if({}.hasOwnProperty.call(e,o)){if(t.includes(o))continue;n[o]=e[o]}return n}(e,t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(o=0;o<i.length;o++)n=i[o],t.includes(n)||{}.propertyIsEnumerable.call(e,n)&&(r[n]=e[n])}return r}(e,a);return o.default.createElement(r.default,c({},l,{icons:t,theme:n}))}},66631:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o,r=function(e,t){if(!t&&e&&e.__esModule)return e;if(null===e||"object"!=typeof e&&"function"!=typeof e)return{default:e};var n=a(t);if(n&&n.has(e))return n.get(e);var o={__proto__:null},r=Object.defineProperty&&Object.getOwnPropertyDescriptor;for(var i in e)if("default"!==i&&{}.hasOwnProperty.call(e,i)){var s=r?Object.getOwnPropertyDescriptor(e,i):null;s&&(s.get||s.set)?Object.defineProperty(o,i,s):o[i]=e[i]}return o.default=e,n&&n.set(e,o),o}(n(96540)),i=(o=n(32155))&&o.__esModule?o:{default:o},s=n(4829);function a(e){if("function"!=typeof WeakMap)return null;var t=new WeakMap,n=new WeakMap;return(a=function(e){return e?n:t})(e)}function l(){return l=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)({}).hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},l.apply(null,arguments)}const{load:c,loading:u,loaded:d,error:f,noicon:p,offline:h}=s.icons;class v extends r.PureComponent{constructor(e){super(e),this.state={isMounted:!1}}componentDidMount(){this.setState({isMounted:!0}),this.props.onDimensions&&this.dimensionElement&&this.props.onDimensions({width:this.dimensionElement.clientWidth||this.dimensionElement.parentNode.clientWidth,height:this.dimensionElement.clientHeight||this.dimensionElement.parentNode.clientHeight})}renderIcon(e){const{icon:t,icons:n,iconColor:o,iconSize:s,theme:a}=e,l=n[t];if(!l)return null;const c=(0,i.default)({width:s+100,height:s,color:o},a.icon);return r.default.createElement("div",c,[r.default.createElement(l,{fill:o,size:s,key:"icon"}),r.default.createElement("br",{key:"br"}),this.props.message])}renderImage(e){return e.icon===d?r.default.createElement("img",l({},(0,i.default)(e.theme.img),{src:e.src,alt:e.alt,width:e.width,height:e.height})):r.default.createElement("svg",l({},(0,i.default)(e.theme.img),{width:e.width,height:e.height,ref:e=>this.dimensionElement=e}))}renderNoscript(e){return this.state.isMounted?null:r.default.createElement("noscript",null,r.default.createElement("img",l({},(0,i.default)(e.theme.img,e.theme.noscript),{src:e.nsSrc,srcSet:e.nsSrcSet,alt:e.alt,width:e.width,height:e.height})))}render(){const e=this.props,{placeholder:t,theme:n}=e;let o;return o=e.icon===d?{}:t.lqip?{backgroundImage:'url("'+t.lqip+'")'}:{backgroundColor:t.color},r.default.createElement("div",l({},(0,i.default)(n.placeholder,o,e.style,e.className),{onClick:this.props.onClick,onKeyPress:this.props.onClick,ref:this.props.innerRef}),this.renderImage(e),this.renderNoscript(e),this.renderIcon(e))}}t.default=v,function(e,t,n){(t=function(e){var t=function(e,t){if("object"!=typeof e||!e)return e;var n=e[Symbol.toPrimitive];if(void 0!==n){var o=n.call(e,t||"default");if("object"!=typeof o)return o;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===t?String:Number)(e)}(e,"string");return"symbol"==typeof t?t:t+""}(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n}(v,"defaultProps",{iconColor:"#fff",iconSize:64})},72612:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o=i(n(96540)),r=i(n(96272));function i(e){return e&&e.__esModule?e:{default:e}}function s(){return s=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)({}).hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},s.apply(null,arguments)}t.default=e=>o.default.createElement(r.default,s({},e,{path:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"}))},73447:(e,t,n)=>{t.A=void 0;var o,r=(o=n(66513))&&o.__esModule?o:{default:o};t.A=r.default},82331:(e,t,n)=>{n.d(t,{A:()=>a});n(96540);var o=n(73447),r=n(21312),i=n(74848);function s(e,t){switch(e){case"noicon":case"loaded":return null;case"loading":return(0,r.T)({id:"theme.IdealImageMessage.loading",message:"Loading...",description:"When the full-scale image is loading"});case"load":{const{pickedSrc:e}=t,{size:n}=e,o=n?` (${function(e){const t=["B","KB","MB","GB","TB"];if(0===e)return"n/a";const n=Math.floor(Math.log(e)/Math.log(1024));return 0===n?`${e} ${t[n]}`:`${(e/1024**n).toFixed(1)} ${t[n]}`}(n)})`:"";return(0,r.T)({id:"theme.IdealImageMessage.load",message:"Click to load{sizeMessage}",description:"To prompt users to load the full image. sizeMessage is a parenthesized size figure."},{sizeMessage:o})}case"offline":return(0,r.T)({id:"theme.IdealImageMessage.offline",message:"Your browser is offline. Image not loaded",description:"When the user is viewing an offline document"});case"error":{const{loadInfo:e}=t;return 404===e?(0,r.T)({id:"theme.IdealImageMessage.404error",message:"404. Image not found",description:"When the image is not found"}):(0,r.T)({id:"theme.IdealImageMessage.error",message:"Error. Click to reload",description:"When the image fails to load for unknown error"})}default:throw new Error(`Wrong icon: ${e}`)}}function a(e){const{img:t,...n}=e;return"string"==typeof t||"default"in t?(0,i.jsx)("img",{src:"string"==typeof t?t:t.default,...n}):(0,i.jsx)(o.A,{...n,height:t.src.height??100,width:t.src.width??100,placeholder:{lqip:t.preSrc},src:t.src.src,srcSet:t.src.images.map((e=>({...e,src:e.path}))),getMessage:s})}},87498:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o=i(n(96540)),r=i(n(96272));function i(e){return e&&e.__esModule?e:{default:e}}function s(){return s=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)({}).hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},s.apply(null,arguments)}t.default=e=>o.default.createElement(r.default,s({},e,{path:"M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"}))},96272:(e,t,n)=>{t.__esModule=!0,t.default=void 0;var o,r=(o=n(96540))&&o.__esModule?o:{default:o};t.default=e=>{let{size:t=24,fill:n="#000",className:o,path:i}=e;return r.default.createElement("svg",{xmlns:"http://www.w3.org/2000/svg",width:t,height:t,viewBox:"0 0 24 24",className:o},r.default.createElement("path",{d:"M0 0h24v24H0z",fill:"none"}),r.default.createElement("path",{fill:n,d:i}))}}}]);