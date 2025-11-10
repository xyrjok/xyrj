// 前端全局配置文件
window.SITE_CONFIG = {
    // 网站名称（通常会由后端 /api/shop/config 覆盖，这里作为默认值）
    siteName: "Cloudflare Faka Demo",
    
    // API 基础路径。如果前后端在同一域名下，保持为 '' 或 '/api' 均可。
    // 如果后端在不同域名，需要填写完整 URL，如 'https://api.example.com'
    apiBase: "", 

    // 当前使用的主题名称（目前主要由 Worker 路由控制，此处仅作记录）
    theme: "default",

    // 版本号
    version: "1.0.0"
};
