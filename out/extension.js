"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const python_shell_1 = require("python-shell");
const multiStepInput_1 = require("./multiStepInput");
const customTreeView_1 = require("./customTreeView");
const deviceTypeList_1 = require("./deviceTypeList");
function activate(context) {
    vscode.window.registerTreeDataProvider('openindus-treeview', new customTreeView_1.OIAccessTreeProvider());
    context.subscriptions.push(vscode.commands.registerCommand('openindus.createproject', () => {
        (0, multiStepInput_1.multiStepInput)(context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('openindus.getDeviceId', () => __awaiter(this, void 0, void 0, function* () {
        let portList = yield getPortList(context);
        if (portList === undefined || portList.length === 0) {
            vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
            return;
        }
        // Let the user choose the device
        let comSelected = yield vscode.window.showQuickPick(portList, {
            placeHolder: 'Select the device'
        });
        if (comSelected === undefined) {
            return;
        }
        let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getDeviceId.py';
        let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, { mode: "json", args: [comSelected] });
        let idReturn = -1;
        pyshell.on('message', function (message) {
            idReturn = parseInt(message.id);
        });
        const { successGetId } = yield new Promise(resolve => {
            pyshell.end(function (err, code) {
                if (code === 0) {
                    resolve({ successGetId: true });
                }
                else {
                    resolve({ successGetId: false });
                }
            });
        });
        // Prompt a success message or an error message
        if (successGetId === true && idReturn >= 0 && idReturn <= 255) {
            vscode.window.showInformationMessage(`${comSelected}` + " ID is " + `${idReturn}`);
        }
        else {
            vscode.window.showErrorMessage("Unexpected error while getting ID");
        }
    })));
    context.subscriptions.push(vscode.commands.registerCommand('openindus.updateDeviceId', () => __awaiter(this, void 0, void 0, function* () {
        // Retrieve available devices with getConnectedBoards.py
        let portList = yield getPortList(context);
        if (portList === undefined || portList.length === 0) {
            vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
            return;
        }
        // Let the user choose the device
        let comSelected = yield vscode.window.showQuickPick(portList, {
            placeHolder: 'Select the device'
        });
        if (comSelected === undefined) {
            return;
        }
        // Let the user choose the ID
        let idSelected = yield vscode.window.showInputBox({
            valueSelection: [1, 254],
            placeHolder: 'Enter the ID',
            validateInput: id => {
                return (parseInt(id) > 0 && parseInt(id) < 255) ? null : "ID is not valid !";
            }
        });
        // Set the ID with setDeviceId.py
        if (comSelected === undefined || idSelected === undefined) {
            return;
        }
        let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/setDeviceId.py';
        let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, { args: [comSelected, idSelected] });
        const { successflash } = yield new Promise(resolve => {
            pyshell.end(function (err, code) {
                if (code === 0) {
                    resolve({ successflash: true });
                }
                else {
                    resolve({ successflash: false });
                }
            });
        });
        // Prompt a success message or an error message
        if (successflash === true) {
            vscode.window.showInformationMessage("Setting ID: " + `${idSelected}` + " to device " + `${comSelected}`);
        }
        else {
            vscode.window.showErrorMessage("Unexpected error while setting ID");
        }
    })));
    context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceFirmware', () => __awaiter(this, void 0, void 0, function* () {
        // Retrieve available devices with getConnectedBoards.py
        let portList = yield getPortList(context);
        if (portList === undefined || portList.length === 0) {
            vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
            return;
        }
        // Let the user choose the device
        let comSelected = yield vscode.window.showQuickPick(portList, {
            placeHolder: 'Select the device'
        });
        if (comSelected === undefined) {
            return;
        }
        // Let the user choose the ID
        let deviceSelected = yield vscode.window.showQuickPick(deviceTypeList_1.deviceTypeList, {
            placeHolder: 'Choose the device type'
        });
        if (deviceSelected === undefined) {
            return;
        }
        // Flash the Firmware with flashDeviceFirmware.py
        let successFlash = yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flashing " + `${deviceSelected}` + " firmware to device " + `${comSelected}`,
            cancellable: true
        }, () => __awaiter(this, void 0, void 0, function* () {
            const { successFlash } = yield new Promise(resolve => {
                if (comSelected === undefined || deviceSelected === undefined) {
                    return;
                }
                let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/flashDeviceFirmware.py';
                let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, { mode: 'json', args: [comSelected, deviceSelected] });
                pyshell.end(function (err, code) {
                    if (code === 0) {
                        resolve({ successFlash: true });
                    }
                    else {
                        resolve({ successFlash: false });
                    }
                });
            });
            return successFlash;
        }));
        // Prompt a success message or an error message
        if (successFlash === true) {
            vscode.window.showInformationMessage("Device " + `${comSelected}` + " flashed successfuly");
        }
        else {
            vscode.window.showErrorMessage("Unexpected error while flashing device !");
        }
    })));
    context.subscriptions.push(vscode.commands.registerCommand('openindus.openinduswebsite', () => {
        vscode.env.openExternal(vscode.Uri.parse('https://openindus.com'));
    }));
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
function getPortList(context) {
    return __awaiter(this, void 0, void 0, function* () {
        // Retrieve available devices with getConnectedBoards.py
        let portList = [];
        let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getConnectedDevices.py';
        let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, { mode: 'json', pythonPath:  });
        pyshell.on('message', function (message) {
            message.devices.forEach((element) => {
                if (element.type !== "undefined") {
                    portList.push(element.port + " - " + element.type);
                }
                else {
                    portList.push(element.port);
                }
            });
        });
        const { success } = yield new Promise(resolve => {
            pyshell.end(function (err, code) {
                if (code === 0) {
                    resolve({ success: true });
                }
                else {
                    resolve({ success: false });
                }
            });
        });
        if (success === false) {
            return undefined;
        }
        else {
            return portList;
        }
    });
}
//# sourceMappingURL=extension.js.map