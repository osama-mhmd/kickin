export type QueueErrorCode =
	| 'configuration'
	| 'validation'
	| 'not_found'
	| 'connection'
	| 'unknown';

export interface QueueErrorOptions {
	code: QueueErrorCode;
	cause?: unknown;
}

export class QueueError extends Error {
	readonly code: QueueErrorCode;

	constructor(message: string, options: QueueErrorOptions) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });

		this.name = 'QueueError';
		this.code = options.code;
	}
}

export class QueueConfigurationError extends QueueError {
	constructor(message: string, cause?: unknown) {
		super(message, { code: 'configuration', cause });

		this.name = 'QueueConfigurationError';
	}
}

export class QueueValidationError extends QueueError {
	constructor(message: string) {
		super(message, { code: 'validation' });

		this.name = 'QueueValidationError';
	}
}

export class QueueJobNotFoundError extends QueueError {
	constructor(message: string) {
		super(message, { code: 'not_found' });

		this.name = 'QueueJobNotFoundError';
	}
}
