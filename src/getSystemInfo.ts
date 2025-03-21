import * as vscode from 'vscode';
import { ModuleInfo, caseImg, getSlaveDeviceInfoList, pickDevice } from './utils';
import { logger } from "./extension";

export async function getSystemInfo(context: vscode.ExtensionContext, portName?: string) {

    let moduleInfo = await pickDevice(context, portName);

    if (moduleInfo === undefined) { return; }
    if (moduleInfo.port === undefined) { return; }

    // Find slave modules on bus
    let slaveInfoList: ModuleInfo[] | undefined;

    // Progress notification with option to cancel while getting device list
    if (moduleInfo.type !== undefined) { // If type is undefined, we have no chance to get slave devices
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Reading slaves modules informations",
            cancellable: true
        }, async (progress, token) => {
            if (moduleInfo !== undefined) {
                slaveInfoList = await getSlaveDeviceInfoList(context, token, moduleInfo.port);
            }
        });
    }

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

    panel.webview.html = getWebviewContent(htmlResources, moduleInfo, slaveInfoList);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'create-project':
                    logger.info("create project clicked !");
                    vscode.commands.executeCommand('openindus.createProject', moduleInfo, slaveInfoList);
                    return;
                case 'flash-device':
                    logger.info("flash device clicked !");
                    vscode.commands.executeCommand('openindus.flashDeviceFirmware', undefined, moduleInfo);
                    return;
                case 'refresh':
                    logger.info("refresh clicked !");
                    if (moduleInfo !== undefined) {
                        vscode.commands.executeCommand('openindus.getSystemInfo', moduleInfo.port);
                        panel.dispose();
                    }
                    return;
                case 'flash-all-slaves':
                    logger.info("flash all slaves clicked !");
                    if (moduleInfo !== undefined && slaveInfoList !== undefined) {
                        vscode.commands.executeCommand('openindus.flashSlavesDevicesFirmware', moduleInfo.port, slaveInfoList);
                    }
                    return;
                case 'flash-slave':
                    logger.info("flash slave: " + message.text + " clicked !");
                    if (moduleInfo !== undefined && slaveInfoList !== undefined) {
                        let selectedSlaveInfoList: ModuleInfo[] = []; // We need a list even if there is only one module
                        selectedSlaveInfoList.push(slaveInfoList[Number(message.text)]);
                        vscode.commands.executeCommand('openindus.flashSlavesDevicesFirmware', moduleInfo.port, selectedSlaveInfoList);
                    }
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}


function getWebviewContent(htmlResources: vscode.Uri, master: ModuleInfo, slaves: ModuleInfo[] | undefined) {

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
    color: #1F1F1F;
    font-family: sans-serif;
    font-size: medium;
    line-height: 20px;
}

h1 {
    text-align: left;
    padding: auto;
    color: var(--vscode-editor-foreground);
}

h2 {
    text-align: left;
    padding: auto;
    color: var(--vscode-editor-foreground);
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
            <button onClick="refresh()">Refresh</button>
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
                        <b>Hardware Version:</b> ${master.hardwareVar}<br>
                        <b>Software version:</b> v${master.versionSw}
                    </p>
                    <button onClick="flashDevice()">Update firmware</button>
                    <button onclick="createProject()">Create project from current configuration</button>`;
    
    if (slaves !== undefined && slaves.length !== undefined && slaves.length > 0) {
        htmlDoc += `<button onClick="flashAllSlaves()">Update firmware of all modules connected on bus</button>`;
    }

    htmlDoc += `
                </div>
            </div>
        </div>`;
        
    if (slaves !== undefined && slaves.length !== undefined && slaves.length > 0) {   
        htmlDoc += `
        <div class="slave-container">
            <div id="div-canvas">
                <canvas id="tree-canvas"></canvas>
            </div>
            <div class="slaves">`;

        let id = 0;
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
                            <b>Hardware Version:</b> ${slave.hardwareVar}<br>
                            <b>Software version:</b> v${slave.versionSw}
                        </p>
                        <button onClick="flashSlave(` + id + `)">Update firmware</button>
                    </div>
                </div>`;
                id++;
        });
    } 
        htmlDoc += `
            </div>
        </div>

        <script type="text/javascript">
            const vscode = acquireVsCodeApi();
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
            
            
            function refresh() {
                vscode.postMessage({
                    command: 'refresh',
                    text: ''
                })
            }

            function createProject() {
                vscode.postMessage({
                    command: 'create-project',
                    text: ''
                })
            }

            function flashDevice() {
                vscode.postMessage({
                    command: 'flash-device',
                    text: ''
                })
            }
            
            function flashAllSlaves() {
                vscode.postMessage({
                    command: 'flash-all-slaves',
                    text: ''
                })
            }

            function flashSlave(id) {
                vscode.postMessage({
                    command: 'flash-slave',
                    text: String(id)
                })
            }

        </script>
    </body>
    </html>`;

    return htmlDoc;
}