// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

// const lightCodeTheme = require("prism-react-renderer/themes/github");
// const darkCodeTheme = require("prism-react-renderer/themes/dracula");
const {themes} = require('prism-react-renderer');
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Web9.AI",
  tagline: "square of web3 to the power of AI",
  favicon: "img/favicon.ico",

  // Set the production url of your site here
  url: "https://www.web9.ai",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "TouchMarsSolutions", // Usually your GitHub org/user name.
  projectName: "web9ai", // Usually your repo name.
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en", "zh-CN"],
  },

  plugins: [
    ['@docusaurus/plugin-ideal-image', {
      quality: 70,
      max: 3840,
      min: 640,
      steps: 20,
      detail: 0.4,
    }],
  ],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          routeBasePath: "/",
          editLocalizedFiles: true,          
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: "https://github.com/TouchMarsSolutions/web9ai/tree/main/",
        },
        blog: {
          showReadingTime: true,
          readingTime: ({content, frontMatter, defaultReadingTime}) => defaultReadingTime({content, options: {wordsPerMinute: 250}}),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: "https://github.com/TouchMarsSolutions/web9ai/tree/main/",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  markdown: {
    mermaid: true
  },
  themes: ['@docusaurus/theme-mermaid'],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({      
      docs: {
        sidebar: {
          hideable: true,
        },
      },
      // Replace with your project's social card
      image: "img/web9.jpeg",
      navbar: {
        title: "Web9.AI",
        logo: {
          alt: "Web9.AI Logo",
          src: "img/logo.svg",
        },
        items: [
          // {
          //   type: 'docSidebar',
          //   sidebarId: 'docsSidebar',
          //   position: 'left',
          //   label: 'AI'
          // },
          {
            type: 'docSidebar',
            sidebarId: 'aiSidebar',
            position: 'left',
            label: 'AI'
          },
          {
            type: 'docSidebar',
            sidebarId: 'devSidebar',
            position: 'left',
            label: 'Dev'
          },
          { to: "/blog", label: "Blog", position: "left" },

          {
            type: "localeDropdown",
            position: "right",
          },
          {
            href: "https://github.com/TouchMarsSolutions/web9ai",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "AI",
                to: "/ai/intro",
              },
            ],
          },
          {
            title: "Connect",
            items: [
              {
                label: "Instagram",
                href: "https://www.instagram.com/web9dotai/",
              },
              {
                label: "Discord",
                href: "https://discordapp.com/invite/web9dotai/",
              },
              {
                label: "Twitter",
                href: "https://twitter.com/web9dotai/",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "Blog",
                to: "/blog",
              },
              {
                label: "GitHub",
                href: "https://github.com/TouchMarsSolutions/web9ai/",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Touch Mars Solutions Inc. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'diff', 'json', 'java', 'kotlin', 'python', 'typescript', 'csharp'],
      },
    }),
};

module.exports = config;
