// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/**
 * The type for log sinks.
 *
 * @param message The log message.
 * @param metadata Provider-defined metadata.
 */
export type LogSink = (message: string, metadata: any) => void;

/**
 * addLogSink registers a function to be called whenever a log message is
 * produced by a compute task (Function, Service, Task, etc.) in this program.
 *
 * @param name The name of this log sink.
 * @param handler The function to handle log messages.
 */
export let addLogSink: (name: string, handler: LogSink) => void;
