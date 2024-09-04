"use strict";(self.webpackChunkweb_9_ai=self.webpackChunkweb_9_ai||[]).push([[6573],{76502:(e,n,i)=>{i.d(n,{Ay:()=>r,RM:()=>s});var t=i(74848),o=i(28453);i(21312);const s=[];function l(e){const n={admonition:"admonition",p:"p",...(0,o.R)(),...e.components};return(0,t.jsx)(n.admonition,{type:"warning",children:(0,t.jsx)(n.p,{children:"Please be duly advised that the content herein does not constitute investment guidance or advice.\nThe material presented is purely for informational purposes and should not be construed as,\nnor relied upon as a recommendation for investment or financial decision-making.\nThe reader bears sole responsibility for any investment decisions made,\nand it is recommended that they seek independent financial advice as required."})})}function r(e={}){const{wrapper:n}={...(0,o.R)(),...e.components};return n?(0,t.jsx)(n,{...e,children:(0,t.jsx)(l,{...e})}):l(e)}},4935:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>a,contentTitle:()=>r,default:()=>h,frontMatter:()=>l,metadata:()=>c,toc:()=>d});var t=i(74848),o=i(28453),s=i(76502);const l={title:"Replicate",image:"/cover/02-replicate.svg",description:"Most popular AI cloud service",keywords:["cloud","replicate.com"],slug:"/replicate",tags:["cloud","coding","semi-techy"]},r="Replicate",c={id:"ai/cloud/replicate",title:"Replicate",description:"Most popular AI cloud service",source:"@site/docs/ai/08-cloud/02-replicate.mdx",sourceDirName:"ai/08-cloud",slug:"/replicate",permalink:"/replicate",draft:!1,unlisted:!1,editUrl:"https://github.com/TouchMarsSolutions/web9ai/tree/main/docs/ai/08-cloud/02-replicate.mdx",tags:[{inline:!0,label:"cloud",permalink:"/tags/cloud"},{inline:!0,label:"coding",permalink:"/tags/coding"},{inline:!0,label:"semi-techy",permalink:"/tags/semi-techy"}],version:"current",sidebarPosition:2,frontMatter:{title:"Replicate",image:"/cover/02-replicate.svg",description:"Most popular AI cloud service",keywords:["cloud","replicate.com"],slug:"/replicate",tags:["cloud","coding","semi-techy"]},sidebar:"aiSidebar",previous:{title:"Run Diffusion",permalink:"/rundiffusion"},next:{title:"Q Blocks",permalink:"/ai/cloud/qblock"}},a={},d=[{value:"Introduction",id:"introduction",level:3},{value:"Investment Info",id:"investment-info",level:2},...s.RM,{value:"2023-May-27",id:"2023-may-27",level:3},...s.RM];function u(e){const n={a:"a",admonition:"admonition",code:"code",h1:"h1",h2:"h2",h3:"h3",header:"header",li:"li",ol:"ol",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,o.R)(),...e.components};return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(n.header,{children:(0,t.jsx)(n.h1,{id:"replicate",children:"Replicate"})}),"\n",(0,t.jsxs)(n.admonition,{title:"Problem:",type:"warning",children:[(0,t.jsxs)(n.ol,{children:["\n",(0,t.jsx)(n.li,{children:"You don't have good GPU to run your ML models"}),"\n",(0,t.jsx)(n.li,{children:"You just want to deploy ML model into cloud with 1-line-command"}),"\n",(0,t.jsx)(n.li,{children:"You want a cheaper bill than Colab Pro or AWS/GCP/Azure"}),"\n"]}),(0,t.jsx)(n.admonition,{title:"Solution:",type:"info",children:(0,t.jsxs)(n.p,{children:[(0,t.jsx)(n.a,{href:"https://replicate.com/",children:"Replicate"})," is a platform that can deploy your ML model into cloud with 1-click."]})})]}),"\n",(0,t.jsx)(n.h3,{id:"introduction",children:"Introduction"}),"\n",(0,t.jsxs)(n.ol,{children:["\n",(0,t.jsx)(n.li,{children:"Run models in the cloud at scale"}),"\n"]}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["Replicate allows running ML models with minimal coding, without deep understanding of ML\u200b.","\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-bash",children:'curl -s -X POST \\\n    -d \'{"version": "db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf", \\\n        "input": { "prompt": "an astronaut riding on a horse" } }\' \\\n    -H "Authorization: Token $REPLICATE_API_TOKEN" \\\n    -H \'Content-Type: application/json\' \\\n    https://api.replicate.com/v1/predictions\n'})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["It has ",(0,t.jsx)(n.a,{href:"https://replicate.com/explore",children:(0,t.jsx)(n.strong,{children:"thousands of ready-to-use models"})})," shared by its community."]}),"\n"]}),"\n",(0,t.jsxs)(n.ol,{start:"2",children:["\n",(0,t.jsx)(n.li,{children:"Push: Package ML models easily"}),"\n"]}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:[(0,t.jsx)(n.strong,{children:"Cog"}),", an open-source tool by Replicate, packages ML models into production-ready containers"]}),"\n",(0,t.jsxs)(n.li,{children:["only 4 steps to push your model into cloud","\n",(0,t.jsxs)(n.ol,{children:["\n",(0,t.jsxs)(n.li,{children:["define the environment your model runs in with ",(0,t.jsx)(n.code,{children:"cog.yaml"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-yaml",children:'build:\n    gpu: true\n    system_packages:\n        - "libgl1-mesa-glx"\n        - "libglib2.0-0"\n    python_version: "3.10"\n    python_packages:\n        - "torch==1.13.1"\npredict: "predict.py:Predictor"\n'})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["define how predictions are run on your model with ",(0,t.jsx)(n.code,{children:"predict.py"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-python",children:'from cog import BasePredictor, Input, Path\nimport torch\n\nclass Predictor(BasePredictor):\n    def setup(self):\n        """Load the model into memory to make running multiple predictions efficient"""\n        self.model = torch.load("./weights.pth")\n\n    # The arguments and types the model takes as input\n    def predict(self,\n        image: Path = Input(description="Grayscale input image")\n    ) -> Path:\n        """Run a single prediction on the model"""\n        processed_image = preprocess(image)\n        output = self.model(processed_image)\n        return postprocess(output)\n'})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["then you can run predictions on this model locally","\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-bash",children:"cog predict -i @input.jpg                \n"})}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:["Finally, push your model to Replicate, and you can run it in the cloud with a few lines of code","\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-bash",children:"cog push\n"})}),"\n"]}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,t.jsxs)(n.ol,{start:"3",children:["\n",(0,t.jsx)(n.li,{children:"Scale: Deploy ML models at scale"}),"\n"]}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["scaling is 100% your choice","\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsx)(n.li,{children:"Automatic scale"}),"\n",(0,t.jsx)(n.li,{children:"Automatic API"}),"\n"]}),"\n"]}),"\n",(0,t.jsxs)(n.li,{children:[(0,t.jsx)(n.strong,{children:"Pay by second"})," billing system"]}),"\n"]}),"\n",(0,t.jsx)(n.h2,{id:"investment-info",children:"Investment Info"}),"\n",(0,t.jsx)(s.Ay,{}),"\n",(0,t.jsx)(n.h3,{id:"2023-may-27",children:"2023-May-27"}),"\n",(0,t.jsxs)(n.ul,{children:["\n",(0,t.jsxs)(n.li,{children:["crunchbase organization: ",(0,t.jsx)(n.a,{href:"https://www.crunchbase.com/organization/replicate",children:"Replicate"})]}),"\n",(0,t.jsxs)(n.li,{children:["Total Funding Amount: ",(0,t.jsx)(n.a,{href:"https://www.crunchbase.com/search/funding_rounds/field/organizations/funding_total/replicate",children:"USD$17.8M"})]}),"\n",(0,t.jsx)(n.li,{children:"value estimated: Not Sure"}),"\n"]}),"\n",(0,t.jsx)(s.Ay,{})]})}function h(e={}){const{wrapper:n}={...(0,o.R)(),...e.components};return n?(0,t.jsx)(n,{...e,children:(0,t.jsx)(u,{...e})}):u(e)}},28453:(e,n,i)=>{i.d(n,{R:()=>l,x:()=>r});var t=i(96540);const o={},s=t.createContext(o);function l(e){const n=t.useContext(s);return t.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function r(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(o):e.components||o:l(e.components),t.createElement(s.Provider,{value:n},e.children)}}}]);