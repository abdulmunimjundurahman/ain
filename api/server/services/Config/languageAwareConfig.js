const { loadCustomConfig, getConfigPath } = require('./loadCustomConfig');
const { logger } = require('@librechat/data-schemas');

let cachedConfigs = {
  'en-US': null,
  'ar-EG': null,
};

/**
 * Get user language from request headers or default to English
 * @param {Object} req - Express request object
 * @returns {string} Language code
 */
function getUserLanguage(req) {
  // Check for language in request headers
  const acceptLanguage = req.headers['accept-language'];
  const userLang = req.headers['x-user-language'];
  
  // Priority: explicit user language header > accept-language header > default
  if (userLang) {
    return userLang;
  }
  
  if (acceptLanguage) {
    // Parse accept-language header (e.g., "ar-EG,ar;q=0.9,en;q=0.8")
    const languages = acceptLanguage.split(',').map(lang => {
      const [code, quality] = lang.trim().split(';q=');
      return { code: code.trim(), quality: quality ? parseFloat(quality) : 1.0 };
    });
    
    // Sort by quality and return the highest quality language
    languages.sort((a, b) => b.quality - a.quality);
    
    for (const lang of languages) {
      if (lang.code.startsWith('ar')) {
        return 'ar-EG';
      }
      if (lang.code.startsWith('en')) {
        return 'en-US';
      }
    }
  }
  
  return 'en-US'; // Default to English
}

/**
 * Load configuration with language awareness
 * @param {Object} req - Express request object
 * @param {boolean} printConfig - Whether to print config information
 * @returns {Promise<Object>} Configuration object
 */
async function loadLanguageAwareConfig(req, printConfig = false) {
  const language = getUserLanguage(req);
  
  // Check if we have a cached config for this language
  if (cachedConfigs[language]) {
    return cachedConfigs[language];
  }
  
  try {
    // Load the language-specific config
    const config = await loadCustomConfig(printConfig, language);
    
    if (config) {
      // Cache the config for this language
      cachedConfigs[language] = config;
      logger.info(`Loaded configuration for language: ${language}`);
    }
    
    return config;
  } catch (error) {
    logger.error(`Failed to load config for language ${language}:`, error);
    
    // Fallback to English config if Arabic fails
    if (language === 'ar-EG') {
      logger.info('Falling back to English configuration');
      return await loadCustomConfig(printConfig, 'en-US');
    }
    
    throw error;
  }
}

/**
 * Clear cached configurations (useful for development or config updates)
 */
function clearConfigCache() {
  cachedConfigs = {
    'en-US': null,
    'ar-EG': null,
  };
  logger.info('Configuration cache cleared');
}

/**
 * Get available languages
 * @returns {Array<string>} Array of supported language codes
 */
function getSupportedLanguages() {
  return ['en-US', 'ar-EG'];
}

module.exports = {
  loadLanguageAwareConfig,
  getUserLanguage,
  clearConfigCache,
  getSupportedLanguages,
  getConfigPath,
};
