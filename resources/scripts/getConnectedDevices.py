import json
from OISerial import OISerial
import serial.tools.list_ports

result = {
  "devices": []
}

target_vid = '10C4'


l = list(serial.tools.list_ports.comports())

# iterate through all available ports
for port in l:

    # check if it is a silicon labs
    if port.vid == int(target_vid, 16):

        # open port
        com = OISerial(port.device)
        
        if (com.connect()):
            data = com.getInfo()
            result["devices"].append({"port": port.device, "type": data["type"], "serialNum": data["serialNum"], "versionHw": data["versionHw"], "versionSw": data["versionFw"]})
            com.disconnect()
        else:
            result["devices"].append({"port": port.device, "type": "undefined", "serialNum": "undefined", "versionHw": "undefined", "versionSw": "undefined"})
       

print(json.dumps(result))
exit(0)