const appConfig = require('./app');
const { config } = require('./EndpointService');
const getCachedTools = require('./getCachedTools');
const mcpToolsCache = require('./mcpToolsCache');
const { loadCustomConfig, getConfigPath } = require('./loadCustomConfig');
const languageAwareConfig = require('./languageAwareConfig');
const loadConfigModels = require('./loadConfigModels');
const loadDefaultModels = require('./loadDefaultModels');
const getEndpointsConfig = require('./getEndpointsConfig');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');

module.exports = {
  config,
  loadCustomConfig,
  getConfigPath,
  loadConfigModels,
  loadDefaultModels,
  loadAsyncEndpoints,
  ...appConfig,
  ...getCachedTools,
  ...mcpToolsCache,
  ...getEndpointsConfig,
  ...languageAwareConfig,
};
