import crypto from 'crypto';

const hash = function(text) {
    const shaChecksum = crypto.createHash('sha1');

    if (typeof text === 'object') {
        text = JSON.stringify(text);
    }
    
    shaChecksum.update(text);

    return shaChecksum.digest('hex');
};


export {
    hash,
};
