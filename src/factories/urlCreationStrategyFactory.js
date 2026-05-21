const GeneratedCodeStrategy = require('../strategies/GeneratedCodeStrategy');
const CustomCodeStrategy = require('../strategies/CustomCodeStrategy');

const getUrlCreationStrategy = ({ customCode }) => {
  if (customCode) {
    return new CustomCodeStrategy();
  }

  return new GeneratedCodeStrategy();
};

module.exports = { getUrlCreationStrategy };
