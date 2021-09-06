"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OIAccessTreeProvider = void 0;
const vscode = require("vscode");
class OIItem extends vscode.TreeItem {
    constructor(label, command, icon, children) {
        super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
        if (command) {
            this.command = { title: label, command };
        }
        if (icon !== undefined) {
            this.iconPath = new vscode.ThemeIcon(icon);
        }
        this.children = children;
    }
}
class OIAccessTreeProvider {
    constructor() {
        this.data = [
            new OIItem('Start a new project', 'openindus.createproject', 'notebook-mimetype'),
            new OIItem('Get device ID', 'openindus.getDeviceId', 'key'),
            new OIItem('Update device ID', 'openindus.updateDeviceId', 'symbol-number'),
            new OIItem('Update device firmware', 'openindus.flashDeviceFirmware', 'flame'),
            new OIItem('Update slave devices on bus', 'openindus.flashDeviceOnBus', 'zap'),
            new OIItem('Get started', 'openindus.openinduswebsite', 'remote-explorer-documentation'),
        ];
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }
}
exports.OIAccessTreeProvider = OIAccessTreeProvider;
//# sourceMappingURL=customTreeView.js.map