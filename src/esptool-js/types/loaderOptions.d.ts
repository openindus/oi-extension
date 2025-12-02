import { ResetConstructors } from "../reset";
import { NodeTransport } from "../nodeTransport";
/**
 * Options to configure ESPLoader.
 * @interface LoaderOptions
 */
export interface LoaderOptions {
    /**
     * The transport mechanism to communicate with the device.
     * @type {Transport}
     */
    transport: NodeTransport;
    /**
     * The baud rate to be used for communication with the device.
     * @type {number}
     */
    baudrate: number;
    /**
     * The baud rate to be used during the initial ROM communication with the device.
     * @type {number}
     */
    romBaudrate: number;
    /**
     * Flag indicating whether to enable debug logging for the loader (optional).
     * @type {boolean}
     */
    debugLogging?: boolean;
    /**
     * Reset functions for connection. If undefined will use default ones.
     * @type {ResetConstructors}
     */
    resetConstructors?: ResetConstructors;
    /**
     * Indicate if trace messages should be enabled or not.
     */
    enableTracing?: boolean;
    /**
     * Indicate is Stub musn't be used.
     */
    noStub?: boolean;
}
