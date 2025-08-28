// src/setupProxy.js
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
    app.use(
        "/api",
        createProxyMiddleware({
            target: "http://raspberry-fredyhi.local:1880",
            changeOrigin: true,
            ws: false, // sólo HTTP; tu WebSocket va por su lado
            logLevel: "silent",
        }),
    );
};
