/*! For license information please see 126d267f.44a7a2de.js.LICENSE.txt */
"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[9401],{6659:(e,n,i)=>{i.d(n,{ZP:()=>r});var t=i(5893),o=i(1151);i(5999);function s(e){const n=Object.assign({admonition:"admonition",p:"p"},(0,o.ah)(),e.components);return(0,t.jsx)(n.admonition,{type:"warning",children:(0,t.jsx)(n.p,{children:"Please be duly advised that the content herein does not constitute investment guidance or advice.\nThe material presented is purely for informational purposes and should not be construed as,\nnor relied upon as a recommendation for investment or financial decision-making.\nThe reader bears sole responsibility for any investment decisions made,\nand it is recommended that they seek independent financial advice as required."})})}const r=function(e={}){const{wrapper:n}=Object.assign({},(0,o.ah)(),e.components);return n?(0,t.jsx)(n,Object.assign({},e,{children:(0,t.jsx)(s,e)})):s(e)}},4150:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>a,contentTitle:()=>l,default:()=>p,frontMatter:()=>r,metadata:()=>c,toc:()=>d});var t=i(5893),o=i(1151),s=i(6659);const r={title:"Replicate",image:"/cover/02-replicate.svg",description:"Most popular AI cloud service",keywords:["cloud","replicate.com"],slug:"/replicate",tags:["cloud","coding","semi-techy"]},l="Replicate",c={unversionedId:"cloud/replicate",id:"cloud/replicate",title:"Replicate",description:"Most popular AI cloud service",source:"@site/docs/08-cloud/02-replicate.mdx",sourceDirName:"08-cloud",slug:"/replicate",permalink:"/ai/replicate",draft:!1,unlisted:!1,editUrl:"https://github.com/TouchMarsSolutions/web9ai/tree/main/docs/08-cloud/02-replicate.mdx",tags:[{label:"cloud",permalink:"/ai/tags/cloud"},{label:"coding",permalink:"/ai/tags/coding"},{label:"semi-techy",permalink:"/ai/tags/semi-techy"}],version:"current",sidebarPosition:2,frontMatter:{title:"Replicate",image:"/cover/02-replicate.svg",description:"Most popular AI cloud service",keywords:["cloud","replicate.com"],slug:"/replicate",tags:["cloud","coding","semi-techy"]},sidebar:"docsSidebar",previous:{title:"Run Diffusion",permalink:"/ai/rundiffusion"},next:{title:"Q Blocks",permalink:"/ai/cloud/qblock"}},a={},d=[{value:"Introduction",id:"introduction",level:3},{value:"Investment Info",id:"investment-info",level:2},{value:"2023-May-27",id:"2023-may-27",level:3}];function u(e){const n=Object.assign({h1:"h1",admonition:"admonition",ol:"ol",li:"li",p:"p",a:"a",h3:"h3",ul:"ul",pre:"pre",code:"code",strong:"strong",h2:"h2"},(0,o.ah)(),e.components);return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(n.h1,{id:"replicate",children:"Replicate"}),"\n",(0,t.jsxs)(n.admonition,{title:"Problem:",type:"warning",children:[(0,t.jsxs)(n.ol,{children:["\n",(0,t.jsx)(n.li,{children:"You don't have good GPU to run your ML models"}),"\n",(0,t.jsx)(n.li,{children:"You just want to deploy ML model into cloud with 1-line-command"}),"\n",(0,t.jsx)(n.li,{children:"You want a cheaper bill than Colab Pro or AWS/GCP/Azure"}),"\n"]}),(0,t.jsx)(n.admonition,{title:"Solution:",type:"info",children:(0,t.jsxs)(n.p,{children:[(0,t.jsx)(n.a,{href:"https://replicate.com/",children:"Replicate"})," is a platform that can deploy your ML model into cloud with 1-click."]})})]}),"\n",(0,t.jsx)(n.h3,{id:"introduction",children:"Introduction"}),"\n",(0,t.jsxs)(n.ol,{children:["\n",(0,t.jsx)(n.li,{children:"Run models in the cloud at scale"}),"\n"]}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["Replicate allows running ML models with minimal coding, without deep understanding of ML\u200b.","\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-bash",children:'curl -s -X POST \\\n    -d \'{"version": "db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf", \\\n        "input": { "prompt": "an astronaut riding on a horse" } }\' \\\n    -H "Authorization: Token $REPLICATE_API_TOKEN" \\\n    -H \'Content-Type: application/json\' \\\n    https://api.replicate.com/v1/predictions\n'})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["It has ",(0,t.jsx)(n.a,{href:"https://replicate.com/explore",children:(0,t.jsx)(n.strong,{children:"thousands of ready-to-use models"})})," shared by its community."]}),"\n"]}),"\n",(0,t.jsxs)(n.ol,{start:"2",children:["\n",(0,t.jsx)(n.li,{children:"Push: Package ML models easily"}),"\n"]}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:[(0,t.jsx)(n.strong,{children:"Cog"}),", an open-source tool by Replicate, packages ML models into production-ready containers"]}),"\n",(0,t.jsxs)(n.li,{children:["only 4 steps to push your model into cloud","\n",(0,t.jsxs)(n.ol,{children:["\n",(0,t.jsxs)(n.li,{children:["define the environment your model runs in with ",(0,t.jsx)(n.code,{children:"cog.yaml"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-yaml",children:'build:\n    gpu: true\n    system_packages:\n        - "libgl1-mesa-glx"\n        - "libglib2.0-0"\n    python_version: "3.10"\n    python_packages:\n        - "torch==1.13.1"\npredict: "predict.py:Predictor"\n'})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["define how predictions are run on your model with ",(0,t.jsx)(n.code,{children:"predict.py"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-python",children:'from cog import BasePredictor, Input, Path\nimport torch\n\nclass Predictor(BasePredictor):\n    def setup(self):\n        """Load the model into memory to make running multiple predictions efficient"""\n        self.model = torch.load("./weights.pth")\n\n    # The arguments and types the model takes as input\n    def predict(self,\n        image: Path = Input(description="Grayscale input image")\n    ) -> Path:\n        """Run a single prediction on the model"""\n        processed_image = preprocess(image)\n        output = self.model(processed_image)\n        return postprocess(output)\n'})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["then you can run predictions on this model locally","\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-bash",children:"cog predict -i @input.jpg                \n"})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["Finally, push your model to Replicate, and you can run it in the cloud with a few lines of code","\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-bash",children:"cog push\n"})}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,t.jsxs)(n.ol,{start:"3",children:["\n",(0,t.jsx)(n.li,{children:"Scale: Deploy ML models at scale"}),"\n"]}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["scaling is 100% your choice","\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"Automatic scale"}),"\n",(0,t.jsx)(n.li,{children:"Automatic API"}),"\n"]}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:[(0,t.jsx)(n.strong,{children:"Pay by second"})," billing system"]}),"\n"]}),"\n",(0,t.jsx)(n.h2,{id:"investment-info",children:"Investment Info"}),"\n",(0,t.jsx)(s.ZP,{}),"\n",(0,t.jsx)(n.h3,{id:"2023-may-27",children:"2023-May-27"}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["crunchbase organization: ",(0,t.jsx)(n.a,{href:"https://www.crunchbase.com/organization/replicate",children:"Replicate"})]}),"\n",(0,t.jsxs)(n.li,{children:["Total Funding Amount: ",(0,t.jsx)(n.a,{href:"https://www.crunchbase.com/search/funding_rounds/field/organizations/funding_total/replicate",children:"USD$17.8M"})]}),"\n",(0,t.jsx)(n.li,{children:"value estimated: Not Sure"}),"\n"]}),"\n",(0,t.jsx)(s.ZP,{})]})}const p=function(e={}){const{wrapper:n}=Object.assign({},(0,o.ah)(),e.components);return n?(0,t.jsx)(n,Object.assign({},e,{children:(0,t.jsx)(u,e)})):u(e)}},5251:(e,n,i)=>{i(7418);var t=i(7294),o=60103;if(n.Fragment=60107,"function"==typeof Symbol&&Symbol.for){var s=Symbol.for;o=s("react.element"),n.Fragment=s("react.fragment")}var r=t.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,l=Object.prototype.hasOwnProperty,c={key:!0,ref:!0,__self:!0,__source:!0};function a(e,n,i){var t,s={},a=null,d=null;for(t in void 0!==i&&(a=""+i),void 0!==n.key&&(a=""+n.key),void 0!==n.ref&&(d=n.ref),n)l.call(n,t)&&!c.hasOwnProperty(t)&&(s[t]=n[t]);if(e&&e.defaultProps)for(t in n=e.defaultProps)void 0===s[t]&&(s[t]=n[t]);return{$$typeof:o,type:e,key:a,ref:d,props:s,_owner:r.current}}n.jsx=a,n.jsxs=a},5893:(e,n,i)=>{e.exports=i(5251)},1151:(e,n,i)=>{i.d(n,{NF:()=>s,Zo:()=>c,ah:()=>r,pC:()=>o});var t=i(7294);const o=t.createContext({});function s(e){return function(n){const i=r(n.components);return t.createElement(e,{...n,allComponents:i})}}function r(e){const n=t.useContext(o);return t.useMemo((()=>"function"==typeof e?e(n):{...n,...e}),[n,e])}const l={};function c({components:e,children:n,disableParentContext:i}){let s;return s=i?"function"==typeof e?e({}):e||l:r(e),t.createElement(o.Provider,{value:s},n)}}}]);