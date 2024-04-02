import * as vscode from 'vscode';
import * as fs from 'fs';
import { ModuleInfo, deviceTypeList, execShell, formatStringOI, pioProjects } from './utils';

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
    if (master !== undefined) {
        boardsNames.forEach((boardsName: vscode.QuickPickItem) => {
            if (formatStringOI(boardsName.label) === formatStringOI(master.type)) {
                state.board = boardsName;
            }
        });
    } else {
        state.board = await vscode.window.showQuickPick(boardsNames, {
            title: "Create a Project",
            placeHolder: "Select the name of the board you will program on",
            ignoreFocusOut: true,
        });
    }

    if (state.board === undefined) { return; }

    // Second STEP: select folder
    const customPath = await vscode.window.showQuickPick(yesNoQuickPick, {
        title: "Create a Project",
        placeHolder: "Do you want to use default location ? (Documents/PlatformIO/Projects)",
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
            } else {
                return undefined;
            }
        }
    });
    
    if (state.name === undefined) { return; }

    // Fourth STEP: select project mode: master, standalone or slave
    if (master !== undefined) {
        state.mode = modeNames[0]; // If master infos are given; select "master" mode without asking
    } else {
        state.mode = await vscode.window.showQuickPick(modeNames, {
            title: "Choose your configuration",
            placeHolder: "Which configuration do you want to use ?",
            ignoreFocusOut: true,
            
        });
    }

    if (state.mode === undefined) { return; }

    // Fith STEP: check last version of openindus library in pio registry
    let data = await execShell("pio pkg show \"openindus/OpenIndus\"", "./");
    let libVersionResults = data?.match(/\d+.\d+.\d+/);
    let libVersion = "";
    if (libVersionResults !== null) {
        libVersion = "@^" + libVersionResults[0];
    }
    libVersion = "openindus/OpenIndus" + libVersion;
    let envName = formatStringOI(state.board.label).toLowerCase();

    // Sixth STEP: create the project directory and copy item
    // Create src directory and copy main.cpp
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/src'));
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/main.cpp')), vscode.Uri.file(state.path + '/' + state.name + '/src/main.cpp'));
    
    // Add modules instance to main.cpp
    let mainSetupText: string = "%MODULE_INIT%";
    var mainInitText: string = "";
    if (master) {
        mainInitText += '\r\n'; // empty line
        var mainInitText: string = "OI" + formatStringOI(master.type) + " " + formatStringOI(master.type) + ";\r\n";  // master instance line

        if (slaves !== undefined) {
            let i = 1;
            slaves.forEach((slave: ModuleInfo) => {
                mainInitText += "OI" + formatStringOI(slave.type) + " " + formatStringOI(slave.type) + String(i) + ";\r\n"; // slave instance line
                i++;
            });
        }
        mainInitText += '\r\n'; // empty line
    }
    // Replave text in main.cpp
    let mainFile = fs.readFileSync(state.path + '/' + state.name + '/src/main.cpp', 'utf8');
    mainFile = mainFile.replaceAll(mainSetupText, mainInitText);
    fs.writeFileSync(state.path + '/' + state.name + '/src/main.cpp', mainFile, 'utf8');
    
    // Create lib directory
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/lib/' + envName));
    
    // Copy sdkconfig.defaults
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/sdkconfig.defaults')), vscode.Uri.file(state.path + '/' + state.name + '/sdkconfig.defaults'));
    
    // Install lib manually (by doing this, pio can find board and scripts before making initialization)
    await execShell("pio pkg install --library \"" + libVersion + "\"  --storage-dir ./lib/" + envName, state.path + '/' + state.name);
    

    if (formatStringOI(state.board.label) === formatStringOI("OICore")) {
        libVersion = "\r\n\t" + libVersion;
        libVersion += "\r\n\tpaulstoffregen/Ethernet@^2.0.0";
        libVersion += "\r\n\tfelis/USB-Host-Shield-20@^1.6.0";
    }

    // Copy platformio.ini and replace %VAR% by the user selection
    await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/platformio.ini')), vscode.Uri.file(state.path + '/' + state.name + '/platformio.ini'));
    let pioFile  = fs.readFileSync(state.path + '/' + state.name + '/platformio.ini', 'utf8');
    pioFile = pioFile.replaceAll("%ENV%", envName);
    pioFile = pioFile.replace("%LIB_VERSION%", libVersion);
    pioFile = pioFile.replace("%MODULE%", state.board.label.toUpperCase().substring(2));
    pioFile = pioFile.replace("%MODE%", state.mode?.label.toUpperCase());
    
    fs.writeFileSync(state.path + '/' + state.name + '/platformio.ini', pioFile, 'utf8');
    
    // Last STEP: Open folfer
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(state.path + '/' + state.name));
}