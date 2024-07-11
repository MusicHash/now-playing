const existsInArray = (input = '', listOfWords = []) => {
    return listOfWords.some(keyword => String(input).toLowerCase().includes(keyword.toLowerCase()));
};

export {
    existsInArray,
};
