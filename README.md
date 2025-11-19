
  <div _ngcontent-ng-c3078685246="" inline-copy-host="" class="markdown markdown-main-panel enable-updated-hr-color" id="model-response-message-contentr_ee07fc9499124a8f" aria-live="polite" aria-busy="false" dir="ltr" style="--animation-duration: 400ms; --fade-animation-function: linear;">
   <h1>Cloudflare Pages 自动发卡系统 (TBshop 主题版)</h1>
   <p></p>
   <p data-path-to-node="4">这是一个基于 <b>Cloudflare Pages</b> + <b>D1 数据库</b> 构建的轻量级、高性能自动发卡系统。采用 <b>前后端分离</b> (但部署在同一项目) 的架构，前端为多页应用 (MPA) 静态页面，后端由 Cloudflare Worker (<code>_worker.js</code>) 承载 API 和路由逻辑。</p>
   <p data-path-to-node="5">本项目搭载了仿淘宝风格的 <b>TBshop 主题</b>，支持 PC 与移动端完美适配，提供流畅的购物体验。</p>
   <p data-path-to-node="6"></p>
   <h2>✨ 项目特性</h2>
   <p></p>
   <p data-path-to-node="7"></p>
   <h3>核心功能</h3>
   <p></p>
   <ul data-path-to-node="8">
    <li><p data-path-to-node="8,0,0"><b>零成本部署</b>：依托 Cloudflare Pages 和 D1 免费额度，无需购买服务器。</p></li>
    <li><p data-path-to-node="8,1,0"><b>极速响应</b>：利用 Cloudflare 全球边缘网络，加载速度极快。</p></li>
    <li><p data-path-to-node="8,2,0"><b>自动发卡</b>：支付成功后自动展示卡密，支持 24 小时无人值守售卖。</p></li>
    <li><p data-path-to-node="8,3,0"><b>多发货模式</b>：</p>
     <ul data-path-to-node="8,3,1">
      <li><p data-path-to-node="8,3,1,0,0"><b>自动发货</b>：库存充足时自动扣减并发货。</p></li>
      <li><p data-path-to-node="8,3,1,1,0"><b>手动发货</b>：管理员后台处理发货。</p></li>
      <li><p data-path-to-node="8,3,1,2,0"><b>自选号码</b>：支持用户在前端自选特定卡密/号码购买（支持自定义加价）。</p></li>
     </ul></li>
    <li><p data-path-to-node="8,4,0"><b>批发优惠</b>：支持设置阶梯批发价（如：买 5 个单价 3 元（5=3）、买 10 个单价 2 元（10=2））。</p></li>
   </ul>
   <p data-path-to-node="9"></p>
   <h3>&#55357;&#57042; TBshop 主题特色</h3>
   <p></p>
   <ul data-path-to-node="10">
    <li><p data-path-to-node="10,0,0"><b>响应式设计</b>：</p>
     <ul data-path-to-node="10,0,1">
      <li><p data-path-to-node="10,0,1,0,0"><b>PC 端</b>：经典左图右文布局，右侧悬浮侧边栏（公告、销量排行）。</p></li>
      <li><p data-path-to-node="10,0,1,1,0"><b>移动端</b>：类原生 App 体验，底部导航栏、侧滑菜单、弹出式 SKU 选择面板。</p></li>
     </ul></li>
    <li><p data-path-to-node="10,1,0"><b>购物车系统</b>：支持多商品合并下单，一次支付。</p></li>
    <li><p data-path-to-node="10,2,0"><b>查单系统</b>：支持 <b>订单号</b> 查询和 <b>联系方式 + 查单密码</b> 查询历史订单。</p></li>
    <li><p data-path-to-node="10,3,0"><b>内容管理</b>：内置简易的文章/教程系统，支持分类和置顶。</p></li>
   </ul>
   <p data-path-to-node="11"></p>
   <h3>&#55357;&#57057;️ 后台管理</h3>
   <p></p>
   <ul data-path-to-node="12">
    <li><p data-path-to-node="12,0,0"><b>仪表盘</b>：实时查看今日订单、收入统计。</p></li>
    <li><p data-path-to-node="12,1,0"><b>商品管理</b>：分类、商品、规格（SKU）、库存管理。</p></li>
    <li><p data-path-to-node="12,2,0"><b>订单管理</b>：查看、搜索、删除订单。</p></li>
    <li><p data-path-to-node="12,3,0"><b>卡密管理</b>：批量导入、删除、查看库存。</p></li>
    <li><p data-path-to-node="12,4,0"><b>支付配置</b>：在线配置支付宝当面付等网关。</p></li>
    <li><p data-path-to-node="12,5,0"><b>数据备份</b>：支持一键导出/导入 D1 数据库 SQL。</p></li>
   </ul>
   <hr data-path-to-node="13" />
   <p data-path-to-node="14"></p>
   <h2>&#55357;&#57056;️ 技术栈</h2>
   <p></p>
   <ul data-path-to-node="15">
    <li><p data-path-to-node="15,0,0"><b>前端</b>：HTML5, Bootstrap 5, Vanilla JS (无框架，轻量级)</p></li>
    <li><p data-path-to-node="15,1,0"><b>后端</b>：Cloudflare Pages Functions (Advanced Mode <code>_worker.js</code>)</p></li>
    <li><p data-path-to-node="15,2,0"><b>数据库</b>：Cloudflare D1 (SQLite)</p></li>
    <li><p data-path-to-node="15,3,0"><b>部署平台</b>：Cloudflare Pages</p></li>
   </ul>
   <hr data-path-to-node="16" />
   <p data-path-to-node="17"></p>
   <h2>&#55357;&#56960; 部署指南</h2>
   <p></p>
   <p data-path-to-node="18"></p>
   <h3>前置准备</h3>
   <p></p>
   <ol start="1" data-path-to-node="19">
    <li><p data-path-to-node="19,0,0">拥有一个 
      <response-element class="" ng-version="0.0.0-PLACEHOLDER">
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <link-block _nghost-ng-c673663489="" class="ng-star-inserted">
        <!---->
        <!---->
        <a _ngcontent-ng-c673663489="" target="_blank" rel="noopener" externallink="" _nghost-ng-c2568321122="" jslog="197247;track:generic_click,impression,attention;BardVeMetadataKey:[[&quot;r_ee07fc9499124a8f&quot;,&quot;c_0ea53dfe23a0097e&quot;,null,&quot;rc_216bd627c4bb1409&quot;,null,null,&quot;zh&quot;,null,1,null,null,1,0]]" href="https://dash.cloudflare.com/" class="ng-star-inserted" data-hveid="0" decode-data-ved="1" data-ved="0CAAQ_4QMahgKEwi4tp3Q4f2QAxUAAAAAHQAAAAAQ1g8">Cloudflare</a>
        <!---->
       </link-block>
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
       <!---->
      </response-element> 账号。</p></li>
    <li><p data-path-to-node="19,1,0">本地安装 <code>Node.js</code> 和 <code>npm</code> (可选，用于本地测试，推荐直接云端部署)。</p></li>
    <li><p data-path-to-node="19,2,0">安装 Wrangler CLI (可选): <code>npm install -g wrangler</code>。</p></li>
   </ol>
   <p data-path-to-node="20"></p>
   <h3>步骤 1: 创建 D1 数据库</h3>
   <p></p>
   <ol start="1" data-path-to-node="21">
    <li><p data-path-to-node="21,0,0">登录 Cloudflare 控制台，进入 <b>Workers &amp; Pages</b> -&gt; <b>D1</b>。</p></li>
    <li><p data-path-to-node="21,1,0">创建一个新数据库，命名为 <code>xyrj</code> (或任意名称)。</p></li>
    <li><p data-path-to-node="21,2,0">进入数据库详情页，点击 <b>Console</b> 标签。</p></li>
    <li><p data-path-to-node="21,3,0">将项目根目录下的 <code>schema.sql</code> 内容复制并在控制台中执行，完成表结构初始化。</p></li>
   </ol>
   <p data-path-to-node="22"></p>
   <h3>步骤 2: 部署到 Cloudflare Pages</h3>
   <p></p>
   <ol start="1" data-path-to-node="23">
    <li><p data-path-to-node="23,0,0">将本项目代码上传到您的 GitHub 仓库。</p></li>
    <li><p data-path-to-node="23,1,0">在 Cloudflare 控制台，进入 <b>Workers &amp; Pages</b> -&gt; <b>Create application</b> -&gt; <b>Pages</b> -&gt; <b>Connect to Git</b>。</p></li>
    <li><p data-path-to-node="23,2,0">选择您的仓库。</p></li>
    <li><p data-path-to-node="23,3,0"><b>构建设置 (Build settings)</b>:</p>
     <ul data-path-to-node="23,3,1">
      <li><p data-path-to-node="23,3,1,0,0"><b>Framework preset</b>: None</p></li>
      <li><p data-path-to-node="23,3,1,1,0"><b>Build command</b>: (留空)</p></li>
      <li><p data-path-to-node="23,3,1,2,0"><b>Build output directory</b>: <code>.</code> (或者是存放静态文件的根目录，本项目结构直接填 <code>.</code> 即可，或者不填)</p></li>
     </ul></li>
    <li><p data-path-to-node="23,4,0">点击 <b>Save and Deploy</b>。</p></li>
   </ol>
   <p data-path-to-node="24"></p>
   <h3>步骤 3: 绑定数据库与环境变量</h3>
   <p></p>
   <p data-path-to-node="25">部署完成后，进入该 Pages 项目的 <b>Settings</b> -&gt; <b>Functions</b>：</p>
   <ol start="1" data-path-to-node="26">
    <li><p data-path-to-node="26,0,0"><b>D1 Database Bindings</b>:</p>
     <ul data-path-to-node="26,0,1">
      <li><p data-path-to-node="26,0,1,0,0">Variable name: <code>MY_XYRJ</code> (必须与 <code>_worker.js</code> 中的变量名一致)</p></li>
      <li><p data-path-to-node="26,0,1,1,0">Database: 选择步骤 1 创建的数据库。</p></li>
     </ul></li>
    <li><p data-path-to-node="26,1,0"><b>Environment Variables (环境变量)</b>: 添加以下变量用于后台登录验证：</p>
     <ul data-path-to-node="26,1,1">
      <li><p data-path-to-node="26,1,1,0,0"><code>ADMIN_USER</code>: <code>admin</code> (您的后台用户名)</p></li>
      <li><p data-path-to-node="26,1,1,1,0"><code>ADMIN_PASS</code>: <code>123456</code> (您的后台密码，请修改)</p></li>
      <li><p data-path-to-node="26,1,1,2,0"><code>ADMIN_TOKEN</code>: <code>your_secret_token</code> (任意长字符串，用于 API 鉴权)</p></li>
     </ul></li>
    <li><p data-path-to-node="26,2,0"><b>重新部署</b>: 配置修改后，需要进入 <b>Deployments</b> 标签页，点击最新的部署右侧的三个点，选择 <b>Retry deployment</b> (或手动触发一次 Git 提交) 才能生效。</p></li>
   </ol>
   <hr data-path-to-node="27" />
   <p data-path-to-node="28"></p>
   <h2>⚙️ 配置说明</h2>
   <p></p>
   <p data-path-to-node="29"></p>
   <h3>后台管理</h3>
   <p></p>
   <ul data-path-to-node="30">
    <li><p data-path-to-node="30,0,0">访问地址：<code>https://您的域名.pages.dev/admin/</code></p></li>
    <li><p data-path-to-node="30,1,0">使用您在环境变量中设置的账号密码登录。</p></li>
   </ul>
   <p data-path-to-node="31"></p>
   <h3>支付配置</h3>
   <p></p>
   <ol start="1" data-path-to-node="32">
    <li><p data-path-to-node="32,0,0">进入后台 -&gt; <b>支付设置</b>。</p></li>
    <li><p data-path-to-node="32,1,0">默认集成了 <b>支付宝当面付</b> (Alipay F2F)。</p></li>
    <li><p data-path-to-node="32,2,0">填入您的支付宝 <code>APPID</code>、<code>商户私钥</code> 和 <code>支付宝公钥</code>。</p></li>
    <li><p data-path-to-node="32,3,0">启用该支付方式。</p></li>
   </ol>
   <p data-path-to-node="33"></p>
   <h3>站点信息</h3>
   <p></p>
   <ul data-path-to-node="34">
    <li><p data-path-to-node="34,0,0">进入后台 -&gt; <b>系统设置</b>。</p></li>
    <li><p data-path-to-node="34,1,0">配置网站标题、Logo URL、公告内容、联系方式等。</p></li>
    <li><p data-path-to-node="34,2,0"><b>主题设置</b>：确保 <code>theme</code> 的值为 <code>TBshop</code> 以启用本主题。</p></li>
   </ul>
   <hr data-path-to-node="35" />
   <p data-path-to-node="36"></p>
   <h2>&#55357;&#56514; 目录结构</h2>
   <p></p>
   <response-element class="" ng-version="0.0.0-PLACEHOLDER">
    <!---->
    <!---->
    <!---->
    <!---->
    <code-block _nghost-ng-c2451299390="" class="ng-tns-c2451299390-442 ng-star-inserted" style="">
     <!---->
     <!---->
     <div _ngcontent-ng-c2451299390="" class="code-block ng-tns-c2451299390-442 ng-animate-disabled ng-trigger ng-trigger-codeBlockRevealAnimation" jslog="223238;track:impression,attention;BardVeMetadataKey:[[&quot;r_ee07fc9499124a8f&quot;,&quot;c_0ea53dfe23a0097e&quot;,null,&quot;rc_216bd627c4bb1409&quot;,null,null,&quot;zh&quot;,null,1,null,null,1,0]]" data-hveid="0" decode-data-ved="1" data-ved="0CAAQhtANahgKEwi4tp3Q4f2QAxUAAAAAHQAAAAAQ1w8" style="display: block;">
      <div _ngcontent-ng-c2451299390="" class="code-block-decoration header-formatted gds-title-s ng-tns-c2451299390-442 ng-star-inserted" style="">
       <span _ngcontent-ng-c2451299390="" class="ng-tns-c2451299390-442">Plaintext</span>
       <div _ngcontent-ng-c2451299390="" class="buttons ng-tns-c2451299390-442 ng-star-inserted">
        <button _ngcontent-ng-c2451299390="" aria-label="Copy code" mat-icon-button="" mattooltip="Copy code" class="mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-mdc-tooltip-trigger copy-button ng-tns-c2451299390-442 mat-unthemed ng-star-inserted" mat-ripple-loader-uninitialized="" mat-ripple-loader-class-name="mat-mdc-button-ripple" mat-ripple-loader-centered="" jslog="179062;track:generic_click,impression;BardVeMetadataKey:[[&quot;r_ee07fc9499124a8f&quot;,&quot;c_0ea53dfe23a0097e&quot;,null,&quot;rc_216bd627c4bb1409&quot;,null,null,&quot;zh&quot;,null,1,null,null,1,0]];mutable:true"><span class="mat-mdc-button-persistent-ripple mdc-icon-button__ripple"></span>
         <mat-icon _ngcontent-ng-c2451299390="" role="img" fonticon="content_copy" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true" data-mat-icon-type="font" data-mat-icon-name="content_copy"></mat-icon><span class="mat-focus-indicator"></span><span class="mat-mdc-button-touch-target"></span></button>
        <!---->
        <!---->
       </div>
       <!---->
      </div>
      <!---->
      <div _ngcontent-ng-c2451299390="" class="formatted-code-block-internal-container ng-tns-c2451299390-442">
       <div _ngcontent-ng-c2451299390="" class="animated-opacity ng-tns-c2451299390-442">
        <pre _ngcontent-ng-c2451299390="" class="ng-tns-c2451299390-442"><code _ngcontent-ng-c2451299390="" role="text" data-test-id="code-content" class="code-container formatted ng-tns-c2451299390-442">├── _worker.js              # 后端核心逻辑 (API路由, 支付, 数据库操作)
├── schema.sql              # 数据库初始化脚本
├── assets/                 # 公共静态资源 (字体, CSS)
├── admin/                  # 后台管理页面 (HTML)
└── themes/
    └── TBshop/             # TBshop 主题目录
        ├── index.html      # 首页
        ├── product.html    # 商品详情页
        ├── cart.html       # 购物车
        ├── orders.html     # 查单页
        ├── pay.html        # 收银台
        └── files/          # 主题专属 JS/CSS
            ├── common.js   # 公共逻辑 (布局注入, 侧栏, 搜索)
            ├── product-page.js
            ├── cart-page.js
            └── ...
</code></pre>
        <!---->
       </div>
      </div>
     </div>
     <!---->
     <!---->
    </code-block>
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
    <!---->
   </response-element>
   <hr data-path-to-node="38" />
   <p data-path-to-node="39"></p>
   <h2>⚠️ 注意事项</h2>
   <p></p>
   <ol start="1" data-path-to-node="40">
    <li><p data-path-to-node="40,0,0"><b>路由规则</b>：本项目使用 <code>_worker.js</code> 的高级模式接管了所有 <code>/api/</code> 请求和 HTML 页面渲染。请勿随意删除或重命名 <code>_worker.js</code>。</p></li>
    <li><p data-path-to-node="40,1,0"><b>数据库配额</b>：Cloudflare D1 免费版有读写限制，对于中小型发卡站完全够用，但请留意官方配额说明。</p></li>
    <li><p data-path-to-node="40,2,0"><b>安全性</b>：请务必修改默认的 <code>ADMIN_PASS</code> 和 <code>ADMIN_TOKEN</code>，并保管好您的支付宝私钥。</p></li>
   </ol>
   <p data-path-to-node="41"></p>
   <h2>&#55357;&#56516; License</h2>
   <p></p>
   <p data-path-to-node="42">MIT License</p>
  </div>
</html>
