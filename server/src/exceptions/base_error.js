class BaseError extends Error {
  name;
  message;

  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.message = message;
  }

  
  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        stacktrace: this.stack
      }
    }
  }
}

export default ValidationError;
