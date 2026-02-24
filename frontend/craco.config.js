module.exports = {
  devServer: (devServerConfig) => {
    // CRA 5 / webpack-dev-server 4 still uses the deprecated
    // onBeforeSetupMiddleware / onAfterSetupMiddleware options internally.
    // Replace them with the current setupMiddlewares API so the
    // deprecation warnings no longer appear in the console.
    const onBefore = devServerConfig.onBeforeSetupMiddleware;
    const onAfter  = devServerConfig.onAfterSetupMiddleware;

    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      if (onBefore) onBefore(devServer);
      if (onAfter)  onAfter(devServer);
      return middlewares;
    };

    return devServerConfig;
  },
};
