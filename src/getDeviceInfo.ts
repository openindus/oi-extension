import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { getDeviceInfoList } from './getDeviceInfoList';
import { getSlaveDeviceInfoList } from './getSlaveDeviceInfoList';
import { ModuleInfo, caseImg } from './utils';
import Module from 'module';

const pioNodeHelpers = require('platformio-node-helpers');

export async function getDeviceInfo(context: vscode.ExtensionContext, portName?: string) {

    let moduleInfoList: ModuleInfo[] | undefined;

    // Progress notification with option to cancel while getting device list
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Retrieving modules informations",
        cancellable: true
    }, async (progress, token) => {
        moduleInfoList = await getDeviceInfoList(context, token);
    });


    if (moduleInfoList === undefined) {
        return;
    }
    if (moduleInfoList.length === 0) {
        vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
        return;
    }

    // Fill a quick pick item list with info of all connected module
    const deviceInfoQuickPickItem: vscode.QuickPickItem[] = [];
    moduleInfoList.forEach((element: ModuleInfo) => {
        deviceInfoQuickPickItem.push({description: '$(debug-stackframe-dot) ' + element.port, label: element.type, detail: 'S/N: ' + element.serialNum + ' $(debug-stackframe-dot) HW version: ' + element.versionHw + ' $(debug-stackframe-dot) SW version: ' + element.versionSw});
    }); 

    // Let the user choose his module (only if several modules are connected)
    let deviceInfoSelected: vscode.QuickPickItem | undefined = undefined;

    if (portName !== undefined) {
        deviceInfoQuickPickItem.forEach((device: vscode.QuickPickItem) => {
            if (device.description?.includes(portName)) {
                deviceInfoSelected = device;
            }
        });
    } 
    else if (moduleInfoList.length > 1) {
        deviceInfoSelected = await vscode.window.showQuickPick(deviceInfoQuickPickItem, { placeHolder: 'Select the master device', ignoreFocusOut: true });
    } 
    else if (moduleInfoList.length = 1) {
        deviceInfoSelected = deviceInfoQuickPickItem[0];
    }

    if (deviceInfoSelected === undefined) { return; }

    // Find the selected item in moduleInfoList
    let moduleInfo: ModuleInfo | undefined = moduleInfoList[0];
    moduleInfoList.forEach((element: ModuleInfo) => {
        if (deviceInfoSelected?.description?.includes(element.port)) { moduleInfo = element; }
    });

    if (moduleInfo === undefined) { return; }
    if (moduleInfo.port === undefined) { return; }

    // Find slave modules on bus
    // Progress notification with option to cancel while getting device list
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Retrieving modules informations",
        cancellable: true
    }, async (progress, token) => {
        moduleInfoList = await getSlaveDeviceInfoList(context, token, moduleInfo.port);
    });

    // Display a webview with all information about the module

    const panel = vscode.window.createWebviewPanel(
        'SystemInformation',
        'System Information',
        vscode.ViewColumn.One,
        {enableScripts: true}
    );

    // Get path to resource on disk
     const onDiskPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'html');

    // And get the special URI to use with the webview
     const htmlResources = panel.webview.asWebviewUri(onDiskPath);

    panel.webview.html = getWebviewContent(htmlResources, moduleInfo, moduleInfoList);
}


function getWebviewContent(htmlResources: vscode.Uri, master: ModuleInfo, slaves: ModuleInfo[]) {

    // Find img and case of master module
    master.imgName = caseImg[0].imgName; // add default img
    master.caseName = caseImg[0].caseName; // add default case
    caseImg.forEach((element: { moduleName: string; imgName: string; caseName: string }) => {
        if (element.moduleName === master.type) {
            master.imgName = element.imgName; // set good img
            master.caseName = element.caseName; // set good case
        }
    });

    // Find img and case of slave module
    if (slaves !== undefined) {
        slaves.forEach((slave: ModuleInfo) => {
            slave.imgName = caseImg[0].imgName; // add default img
            slave.caseName = caseImg[0].caseName; // add default case
            caseImg.forEach((element: { moduleName: string; imgName: string; caseName: string }) => {
                if (element.moduleName === slave.type) {
                    slave.imgName = element.imgName; // set good img
                    slave.caseName = element.caseName; // set good case
                }
            });
        });
    }
    
    
    let htmlDoc = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cat Coding</title>
        <style>
body {
    background-color: #1F1F1F;
    color: #1F1F1F;
    font-family: sans-serif;
    font-size: medium;
    line-height: 20px;
}

h1 {
    text-align: left;
    padding: auto;
    color: #FFF;
}

h2 {
    text-align: left;
    padding: auto;
    color: #FFF;
}

h2 {
    font-size: large;
}

button {
    margin: 5px;
    background: #0071dc;
    border: 1px solid #007ce3;
    border-radius: 5px;
    color: #ffffff;
    padding: 10px 20px;
    cursor:pointer;
  }

.flex-container {
    display: flex;
    width: auto;
    align-items: center;
    background-color: #F5F5F5;
    border-radius: 5px;
    margin: 5px;
}

.BOI23,.BOI13 {
    max-width: 150px;
    min-width: 150px;
    background-color: none;
}

.BOI12 {
    max-width: 100px;
    min-width: 100px;
    background-color: none;
    margin: 0 25px;
}

.slave-container, .master-container {
    display: flex;
}

.auto {
    flex: auto;
    padding: 1em;
    display: flex;
    flex-direction: column;
}

canvas {
    max-width: 200px;
}
        </style>
    </head>

    <body>
        <h1 id="test">System configuration</h1>
        <div class="button-container">
            <h2>Quick actions: </h2>
            <a href="https://www.example.com"><button>Refresh</button></a>
            <a href="https://openindus.com/oi-content/doc/index.html"><button>Online Help</button></a>
        </div>
        <div style="border:1px solid #F5F5F5; margin: 15px;"></div>
        <div class="master-container">
            <div class="flex-container master">
                <div class="item auto ${master.caseName}"><img src="${htmlResources}/${master.imgName}"></div>
                <div class="item auto">
                    <h3>${master.type}</h3>
                    <div style="border:1px solid #1F1F1F;"></div>
                    <p>
                        Connected on ${master.port}<br>
                        <b>Serial Number:</b> ${master.serialNum}<br>
                        <b>Hardware Version:</b> ${master.versionHw}<br>
                        <b>Software version:</b> v${master.versionSw}
                    </p>
                    <a href="https://www.example.com"><button>Update firmware</button></a>`;
    
    if (slaves !== undefined) {
        htmlDoc += `
                    <a href="https://www.example.com"><button>Create project from current configuration</button></a>
                    <a href="https://www.example.com"><button>Update all modules firmware connected on bus</button></a>`;
    }

    htmlDoc += `
                </div>
            </div>
        </div>`;
        
    if (slaves?.length > 0) {   
        htmlDoc += `
        <div class="slave-container">
            <div id="div-canvas">
                <canvas id="tree-canvas"></canvas>
            </div>
            <div class="slaves">`;

        slaves.forEach((slave: ModuleInfo) => {
            htmlDoc += 
                `<div class="flex-container slave">
                    <div class="item auto ${slave.caseName}"><img src="${htmlResources}/${slave.imgName}"></div>
                    <div class="item auto">
                        <h3>${slave.type}</h3>
                        <div style="border:1px solid #1F1F1F;"></div>
                        <p>
                            Connected on Bus<br>
                            <b>Serial Number:</b> ${slave.serialNum}<br>
                            <b>Hardware Version:</b> ${slave.versionHw}<br>
                            <b>Software version:</b> v${slave.versionSw}
                        </p>
                        <a href="https://www.example.com"><button>Update firmware</button></a>
                    </div>
                </div>`;
        });
    } 
        htmlDoc += `
            </div>
        </div>

        <script type="text/javascript">
            var canvas = document.getElementById("tree-canvas");
            var slave1 = document.getElementsByClassName("slave")[0];
            var ctx = canvas.getContext("2d");
            canvas.width = document.getElementById("div-canvas").clientWidth;
            canvas.height = document.getElementById("div-canvas").clientHeight;
            var slaveCount = document.querySelectorAll('.slave').length;
            ctx.beginPath();
            
            for (let i = 0; i < slaveCount; i++) {
                ctx.moveTo(canvas.width/2,0);
                ctx.lineTo(canvas.width/2,slave1.clientHeight*(0.5+i));
                ctx.lineTo(canvas.width,slave1.clientHeight*(0.5+i));
            }
            ctx.strokeStyle = '#F0F0F0';
            ctx.lineWidth = 5;
            ctx.stroke();
        </script>
    </body>
    </html>`;

    return htmlDoc;
}