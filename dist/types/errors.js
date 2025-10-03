"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneratorError = exports.ErrorType = void 0;
var ErrorType;
(function (ErrorType) {
    ErrorType["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorType["PROCESSING_ERROR"] = "PROCESSING_ERROR";
    ErrorType["FILE_ERROR"] = "FILE_ERROR";
    ErrorType["CONFIG_ERROR"] = "CONFIG_ERROR";
    ErrorType["DUPLICATE_ERROR"] = "DUPLICATE_ERROR";
    ErrorType["MEMORY_ERROR"] = "MEMORY_ERROR";
    ErrorType["GPU_ERROR"] = "GPU_ERROR";
    ErrorType["WORKER_ERROR"] = "WORKER_ERROR";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
class GeneratorError extends Error {
    constructor(type, message, context, recoverable = false) {
        super(message);
        this.name = 'GeneratorError';
        this.type = type;
        this.context = context;
        this.recoverable = recoverable;
    }
}
exports.GeneratorError = GeneratorError;
//# sourceMappingURL=errors.js.map