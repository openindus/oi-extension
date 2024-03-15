import * as vscode from 'vscode';
import * as fs from 'fs';
import { PythonShell } from 'python-shell';
import * as path from 'path';
import { deviceTypeList, pioProjects, sourceAddress } from './utils';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";

import * as cp from "child_process";

const execShell = (cmd: string, path: string) =>
    new Promise<string>((resolve, reject) => {
        cp.exec(cmd, {cwd: path}, (err, out) => {
            if (err) {
                return reject(err);
            }
            return resolve(out);
        });
    });

export async function createProject(context: vscode.ExtensionContext) {
    
    const boardsNames: vscode.QuickPickItem[] = deviceTypeList.map(label => ({ label }));
	const yesNoList: string[] = ['yes', 'no'];
    const yesNoQuickPick: vscode.QuickPickItem[] = yesNoList.map(label => ({ label }));
    let firmwareVersions: vscode.QuickPickItem[] = [];
	const fileDownloader: FileDownloader = await getApi();

	const optionsSelectFolder: vscode.OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Select Folder',
		canSelectFiles: false,
		canSelectFolders: true,
		title: 'Select a root folder for your application'
	};

	interface State {
		title: string;
		board: vscode.QuickPickItem;
		name: string;
        path: string;
		version: vscode.QuickPickItem;
        firmware: vscode.Uri;
	}

    let state = {} as Partial<State>;

    // First STEP: select board
    state.board = await vscode.window.showQuickPick(boardsNames, {
        title: "Create a Project",
        placeHolder: "Select the name of the board you will program on",
        ignoreFocusOut: true,
    });

    if (state.board === undefined) { return; }

    // Second STEP: select folder
    const customPath = await vscode.window.showQuickPick(yesNoQuickPick, {
        title: "Create a Project",
        placeHolder: "Do you want to use default location ?",
        ignoreFocusOut: true,
    });

    if (customPath?.label === "no") {
        state.path = await vscode.window.showOpenDialog(optionsSelectFolder).then(fileUri => {
            if (fileUri && fileUri[0]) {
                return fileUri[0].fsPath;
            }
            else {
                return undefined;
            }
        });
    }
    else {
        state.path = pioProjects;
    }
    
    if (state.path === undefined) { return; }

    // Third STEP: select project name
    state.name = await vscode.window.showInputBox({
        title: "Create a Project",
        value: "my_project",
        prompt: 'Enter a name for your project',
        ignoreFocusOut: true,
        validateInput: (text: string): string | undefined => {
            if (fs.existsSync(state.path + '/' + text) && text !== "") { // Check is folder already exists
                return "Folder already exits";
            } else if (text.indexOf(' ') >= 0) { // Check for white space
                return "Project could not contains white space";
            } else {
                return undefined;
            }
        }
    });
    
    if (state.name === undefined) { return; }

    // Fourth STEP: create th eproject directory and copy item
    
    // Create directory
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/src'));
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/lib'));

    await execShell("pio pkg install --library \"openindus/OpenIndus@^0.0.4\"  --storage-dir ./lib", state.path + '/' + state.name);

    // let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getDeviceId.py';
    // let pyshell = new PythonShell(myPythonScriptPath, { mode: "json", pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe', args: [comSelected]});
    // let idReturn = -1;

    // pyshell.on('message', function (message) {
    //     idReturn = parseInt(message.id);
    // });

    // const { successGetId } = await new Promise( resolve => {
    //     pyshell.end(function (err: any, code: any) {
    //         if (code === 0) {
    //             resolve({ successGetId: true });
    //         } else {
    //             resolve({ successGetId: false });
    //         }
    //     });
    // });

    // // Prompt a success message or an error message
    // if (successGetId === true && idReturn >= 0 && idReturn <= 255) {
    //     vscode.window.showInformationMessage(`${comSelected}` + " ID is " + `${idReturn}`);
    // } else {
    //     vscode.window.showErrorMessage("Unexpected error while getting ID");
    // }

    // platformio.ini
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/platformio.ini')), vscode.Uri.file(state.path + '/' + state.name + '/platformio.ini'));
    // CMakeLists.txt
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/CMakeLists.txt')), vscode.Uri.file(state.path + '/' + state.name + '/CMakeLists.txt'));
    // sdkconfig.defaults
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/sdkconfig.defaults')), vscode.Uri.file(state.path + '/' + state.name + '/sdkconfig.defaults'));
    
    // Open folfer
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(state.path + '/' + state.name));
}