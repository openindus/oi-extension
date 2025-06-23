import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {Mutex} from 'async-mutex';
import { OIStepper } from "../com/OIStepper";
import { logger } from "../extension";
import { ModuleInfo } from '../utils';

var currentPanel:vscode.WebviewPanel = undefined;
var stepper:OIStepper = undefined;

export async function startStepperPanelConfig(context: vscode.ExtensionContext, portName?: string, stepperModuleInfo?: ModuleInfo) {
    
    // If we already have a panel, show it.
    if (currentPanel !== undefined) {
        currentPanel.reveal();
        return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel('OIStepperConfig', 'OIStepperConfig', vscode.ViewColumn.One, {enableScripts: true});
    currentPanel = panel;

	const contentUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'html', 'content'));

	fs.readFile(path.join(context.extensionPath, 'resources', 'html', 'stepper.html'), (err,data) => {
		if (err) {
			logger.error(err);
		} else {
			let rawHTML = data.toString();
			rawHTML = rawHTML.replaceAll('${content}', contentUri.toString());
			panel.webview.html = rawHTML;
		}
	});		

	panel.onDidDispose(async () => {
		currentPanel = undefined;
		await stepper?.disconnect();
		stepper = undefined;
	});

	var receivedMessageMutex = new Mutex();
	var lastCommand = '';

	panel.webview.onDidReceiveMessage( 
		async (message) => {
			// If mutex is locked and message is a "get-status" or a message already sent (multiple user clicks), ignore the message
			if (receivedMessageMutex.isLocked()) {
				if (message.command === 'get-status' || (message.command + message.args?.join()) === lastCommand) {
					logger.info("Received message while mutex is locked, ignoring message: " + JSON.stringify(message));
					return;
				}
			} else {
				lastCommand = message.command + message.args?.join();
			}
			await receivedMessageMutex.acquire();
			switch (message.command) {
				case 'connect':
					if (stepper?.isOpen) {
						panel.webview.postMessage({command: message.command, response: "error: already connected"});
						break;
					}
					stepper = new OIStepper(message.portName, message?.serialNum, message?.id, message?.onBus);
					await stepper.connect().then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Error while connecting to OIStepper (" + message.portName + "): " + error);
					});
					break;
				case 'disconnect':
					await stepper?.disconnect().then((response) => {
						stepper = undefined;
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Error while disconnecting  from OIStepper: " + error);
						panel.webview.postMessage({command: message.command, response: false}); // Send a message to display "connect button again"	
					});
					break;
				case 'list':
					await OIStepper.listStepper().then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Cannot get list of connected device: " + error);
					});
					break;
				case 'cmd':
					await stepper?.cmd(message.args).then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Cannot send command (" + message.args.join(' ') + "): " + error);						
						if (error.includes("disconnected")) {
							panel.webview.postMessage({command: 'disconnect', response: true});
						}
					});
					break;
				case 'get-parameters':
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: `Getting OIStepper parameters...`,
						cancellable: false
					}, async () => {
						await stepper?.getParam(message.args[0]).then((response) => {
							panel.webview.postMessage({ command: message.command, response: response }).then(() => {
								vscode.window.showInformationMessage("Get parameter successfully on OIStepper.");
							});
						}).catch((error) => {
							vscode.window.showErrorMessage("Error while getting parameters on OIStepper: " + error);						
							if (error.includes("disconnected")) {
								panel.webview.postMessage({command: 'disconnect', response: true});
							}
						});
					});
					break;
				case 'set-parameters':
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: `Setting OIStepper parameters...`,
						cancellable: false
					}, async () => {
						await stepper?.setParam(message.args[0], message.args[1]).then(() => {
							panel.webview.postMessage({ command: message.command, response: true }).then(() => {
								vscode.window.showInformationMessage("Parameters set successfully on OIStepper.");
							});
						}).catch((error) => {
							vscode.window.showErrorMessage("Error while setting parameters on OIStepper: " + error);						
							if (error.includes("disconnected")) {
								panel.webview.postMessage({command: 'disconnect', response: true});
							}
						});
					});
					break;
				case 'reset-parameters':
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: `Resetting OIStepper parameters...`,
						cancellable: false
					}, async () => {
						await stepper?.resetParam(message.args[0]).then(() => {
							panel.webview.postMessage({ command: message.command, response: true }).then(() => {
								vscode.window.showInformationMessage("Parameters where resetted successfully on OIStepper. Reading parameters again to get the default values.");
							});
						}).catch((error) => {
							vscode.window.showErrorMessage("Error while setting parameters on OIStepper: " + error);						
							if (error.includes("disconnected")) {
								panel.webview.postMessage({command: 'disconnect', response: true});
							}
						});
					});
					break;
				case 'save-parameters':
					await vscode.window.showSaveDialog().then((fileUri) => {
						if (fileUri.fsPath !== undefined) {
							fs.writeFileSync(fileUri.fsPath, JSON.stringify(message.args[0], null, 2));
						}
					});
					break;
				case 'load-parameters':
					await vscode.window.showOpenDialog().then((fileUri) => {
						if (fileUri && fileUri[0]) {
							const filePath = fileUri[0].fsPath;
							fs.readFile(filePath, 'utf8', (err, data) => {
								if (err) {
									vscode.window.showErrorMessage("Error reading file: " + err.message);
								} else {
									try {
										const parameters = JSON.parse(data);
										panel.webview.postMessage({ command: message.command, response: parameters }).then(() => {
											vscode.window.showInformationMessage("Parameters where loaded successfully from " + filePath);
										});
									} catch (parseError) {
										vscode.window.showErrorMessage("Error parsing JSON: " + parseError.message);
									}
								}
							});
						}
					});
					break;
				case 'get-status':
					await stepper?.getStatus().then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Cannot get status from OIStepper: " + error);
						if (error.includes("disconnected")) {
							panel.webview.postMessage({command: 'disconnect', response: true});
						}
					});
					break;
				default:
					break;
			}
			receivedMessageMutex.release();
		},
        undefined,
        context.subscriptions
	);

	// If stepper info where given, create the stepper object
	if (portName && stepperModuleInfo) {
		stepper = new OIStepper(portName, stepperModuleInfo.serialNum, "0", false);
		await stepper.connect().then((response) => {
			panel.webview.postMessage({command: 'connect', response: response});
		}).catch((error) => {
			vscode.window.showErrorMessage("Error while connecting to OIStepper (" + portName + "): " + error);
		});
	} else {
		// Do an automatic refresh
		await OIStepper.listStepper().then((response) => {
			panel.webview.postMessage({command: 'list', response: response});
		}).catch((error) => {
			vscode.window.showErrorMessage("Cannot get list of connected device: " + error);
		});
	}	
}