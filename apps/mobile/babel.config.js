module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
            '@nyan-stock/shared': '../../packages/shared/src',
          },
        },
      ],
    ],
  };
};
