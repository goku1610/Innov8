const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        'vscode': require.resolve('vscode-languageclient/lib/common/vscode')
      };
      return webpackConfig;
    }
  }
};
