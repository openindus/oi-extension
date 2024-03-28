import * as vscode from 'vscode';
import * as fs from 'fs';
import { ModuleInfo, deviceTypeList, execShell, pioProjects } from './utils';
import * as cp from "child_process";



export async function createProject(context: vscode.ExtensionContext, master?: ModuleInfo, slaves?: ModuleInfo[]) {
    
    const boardsNames: vscode.QuickPickItem[] = deviceTypeList.map(label => ({ label }));
    const modeNames: vscode.QuickPickItem[] = [ {label: 'Master', detail:'Choose "master" if the module you are programming on is used to control other modules'},
                                                {label: 'Standalone', detail: 'Choose "standalone" if the module you are programming on is use alone'},
                                                {label: 'Slave', detail: 'Choose "slave" if the module is controlled by a "master" module (not recommended)'}];
	const yesNoList: string[] = ['yes', 'no'];
    const yesNoQuickPick: vscode.QuickPickItem[] = yesNoList.map(label => ({ label }));
    const path = require('path');

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
        mode: vscode.QuickPickItem;
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
            if (text !== path.basename(text)) { 
                return "Name is not valid";
            } else if (fs.existsSync(state.path + '/' + text) && text !== "") { // Check is folder already exists
                return "Folder already exits";
            } else if (text.indexOf(' ') >= 0) { // Check for white space
                return "Project name can not contains white space";
            } else if (text.indexOf('*') >= 0) { // Check for "*"
                return "Project name can not contains *";
            }else {
                return undefined;
            }
        }
    });
    
    if (state.name === undefined) { return; }

    // Fourth STEP: select project mode: master, standalone or slave
    state.mode = await vscode.window.showQuickPick(modeNames, {
        title: "Choose your configuration",
        placeHolder: "Which configuration do you want to use ?",
        ignoreFocusOut: true,
    });

    if (state.mode === undefined) { return; }

    // Fith STEP: check last version of openindus library
    var data = await execShell("pio pkg show \"openindus/OpenIndus\"", "./");
    var libVersionResults = data?.match(/\d+.\d+.\d+/);
    var libVersion = "";
    if (libVersionResults !== null) {
        libVersion = "@^" + libVersionResults[0];
    }
    var envName = state.board.label.toLowerCase().substring(2);

    // Sixth STEP: create the project directory and copy item
    // Create src directory and copy main.cpp
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/src'));
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/main.cpp')), vscode.Uri.file(state.path + '/' + state.name + '/src/main.cpp'));
    if (master) {
        // TODO add master
    }
    // Create lib directory
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/lib/' + envName));
    // Copy sdkconfig.defaults
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/sdkconfig.defaults')), vscode.Uri.file(state.path + '/' + state.name + '/sdkconfig.defaults'));
    // Install lib manually (by doing this, pio can find board and scripts before making initialization)
    await execShell("pio pkg install --library \"openindus/OpenIndus" + libVersion + "\"  --storage-dir ./lib/" + envName, state.path + '/' + state.name);
    // Copy platformio.ini and replace *ENV* by the user selection
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/platformio.ini')), vscode.Uri.file(state.path + '/' + state.name + '/platformio.ini'));
    var data  = fs.readFileSync(state.path + '/' + state.name + '/platformio.ini', 'utf8');
    data = data.replaceAll("*ENV*", envName);
    data = data.replace("*LIB_VERSION*", libVersion);
    data = data.replace("*MODULE*", envName.toUpperCase());
    data = data.replace("*MODE*", state.mode?.label.toUpperCase());
    
    fs.writeFileSync(state.path + '/' + state.name + '/platformio.ini', data, 'utf8');
    
    // Last STEP: Open folfer
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(state.path + '/' + state.name));
}