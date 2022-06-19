import BaseError from './base_error.js';

class ValidationError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export default ValidationError;
