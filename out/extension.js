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
const pioNodeHelpers = require('platformio-node-helpers');
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
        let comSelected = undefined;
        if (portList.length > 1) {
            comSelected = yield vscode.window.showQuickPick(portList, { placeHolder: 'Select the device' });
        }
        else if (portList.length = 1) {
            comSelected = portList[0];
        }
        if (comSelected === undefined) {
            return;
        }
        let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getDeviceId.py';
        let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, { mode: "json", pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe', args: [comSelected] });
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
        let comSelected = undefined;
        if (portList.length > 1) {
            comSelected = yield vscode.window.showQuickPick(portList, { placeHolder: 'Select the device' });
        }
        else if (portList.length = 1) {
            comSelected = portList[0];
        }
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
        let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, { pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe', args: [comSelected, idSelected] });
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
        let comSelected = undefined;
        if (portList.length > 1) {
            comSelected = yield vscode.window.showQuickPick(portList, { placeHolder: 'Select the device' });
        }
        else if (portList.length = 1) {
            comSelected = portList[0];
        }
        if (comSelected === undefined) {
            return;
        }
        // Let the user choose the ID
        let deviceSelected = yield vscode.window.showQuickPick(deviceTypeList_1.deviceTypeList, { placeHolder: 'Choose the device type' });
        if (deviceSelected === undefined) {
            return;
        }
        // Flash the Firmware with flashDeviceFirmware.py
        let successFlash = yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flashing " + `${deviceSelected}` + " on " + `${comSelected}`,
            cancellable: true
        }, (progress) => __awaiter(this, void 0, void 0, function* () {
            const { successFlash } = yield new Promise(resolve => {
                let bootloader;
                let appFlashEsp32;
                let esptype;
                if (deviceSelected === 'OICore') {
                    bootloader = context.asAbsolutePath('/resources/bin/') + 'bootloader_esp32.bin';
                    appFlashEsp32 = context.asAbsolutePath('/resources/bin/') + 'app_flash_esp32.bin';
                    esptype = "esp32";
                }
                else {
                    bootloader = context.asAbsolutePath('/resources/bin/') + 'bootloader_esp32s2.bin';
                    appFlashEsp32 = context.asAbsolutePath('/resources/bin/') + 'app_flash_esp32s2.bin';
                    esptype = "esp32s2";
                }
                let firmware = context.asAbsolutePath('/resources/bin/') + (deviceSelected === null || deviceSelected === void 0 ? void 0 : deviceSelected.toLowerCase().substring(2)) + '.bin';
                let otaDataInitial = context.asAbsolutePath('/resources/bin/') + 'ota_data_initial.bin';
                let partitions = context.asAbsolutePath('/resources/bin/') + 'partitions.bin';
                let options = {
                    mode: "text",
                    pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe',
                    args: ['--chip', esptype,
                        '--port', comSelected === null || comSelected === void 0 ? void 0 : comSelected.split(" ")[0], '--baud', '921600',
                        'write_flash',
                        '-z',
                        '0x1000', bootloader,
                        '0x8000', partitions,
                        '0xd000', otaDataInitial,
                        '0x20000', firmware,
                        '0x3C0000', appFlashEsp32]
                };
                let myPythonScriptPath = 'C:/Users/aurelien/.platformio/packages/framework-espidf/components/esptool_py/esptool/esptool.py';
                let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, options);
                pyshell.on('message', function (message) {
                    console.log(message);
                });
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
    context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceOnBus', () => __awaiter(this, void 0, void 0, function* () {
        // Retrieve available devices with getConnectedBoards.py
        let portList = yield getPortList(context, 'OICore');
        if (portList === undefined || portList.length === 0) {
            vscode.window.showWarningMessage("Could not find OICore on any port, please check connection between OICore and computer");
            return;
        }
        let comSelected = undefined;
        if (portList.length > 1) {
            comSelected = yield vscode.window.showQuickPick(portList, { placeHolder: 'Select the device' });
        }
        else if (portList.length = 1) {
            comSelected = portList[0];
        }
        if (comSelected === undefined) {
            return;
        }
        // Flash the Firmware with flashDeviceFirmware.py
        let successFlash = yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flashing",
            cancellable: true
        }, (progress) => __awaiter(this, void 0, void 0, function* () {
            const { successFlash } = yield new Promise(resolve => {
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
function getPortList(context, type) {
    return __awaiter(this, void 0, void 0, function* () {
        // Retrieve available devices with getConnectedBoards.py
        let portList = [];
        let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getConnectedDevices.py';
        let pyshell = new python_shell_1.PythonShell(myPythonScriptPath, { mode: 'json', pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe' });
        pyshell.on('message', function (message) {
            message.devices.forEach((element) => {
                if (type === undefined || (type !== undefined && element.type === type)) {
                    if (element.type !== "undefined") {
                        portList.push(element.port + " - " + element.type);
                    }
                    else {
                        portList.push(element.port);
                    }
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