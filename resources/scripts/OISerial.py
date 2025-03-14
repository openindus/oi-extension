import json
import os
from serial import Serial
from time import sleep
from datetime import datetime

class OISerial(Serial):

    def __init__(self, port):
        super().__init__(baudrate=115200, timeout=1)
        self._setDTR(True)
        self._setRTS(True)
        self.rtscts
        self.connected = False
        self.last_response = bytes()
        self.port = port
        self.prompt = str()

    def _setDTR(self, state):
        self.setDTR(state)

    def _setRTS(self, state):
        self.setRTS(state)
        # Work-around for adapters on Windows using the usbser.sys driver:
        # generate a dummy change to DTR so that the set-control-line-state
        # request is sent with the updated RTS state and the same DTR state
        self.setDTR(self.dtr)

    def connect(self) -> bool:

        if self.connected:
            return True
        
        try:
            # open port and connect to console
            self.open()
            sleep(0.05)
            self.prompt = self.getPromt()
            if (self.prompt != ""):
                self.connected = True
                return True
        
        except Exception as e:
            return False
        
        
        
        return False
    

    def disconnect(self) -> None:

        if not self.connected:
            return
        self.close()
        self.connected = False
        self._setDTR(True)
        self._setRTS(True)

    
    def getPromt(self) -> str:

        # Reset board by toggling RTS and DTR lines
        self._setDTR(False)
        self._setRTS(False)
        sleep(0.05)
        # check if init is OK
        self.flush()
        self.write(b'console')
        sleep(0.1)
        start_time = datetime.now()
        line = self.readline()
        while not b'>' in line:
            if line == b"":
                self.write(b'\r\n')
            line = self.readline()
            if (datetime.now()-start_time).seconds > 3:
                return ""
        line.replace(b' ', b'')
        return line.decode()


    def sendMsg(self, args, try_number=0) -> bool:

        # print(f"Sending message: {args}")
        self.last_response = ""
        start_time = datetime.now()

        if self.connected:
            if try_number > 10:
                return False
            
            self.write(args + b'\r\n')
            self.last_response = self.readline()
            # Looking for echo 
            while(not args in self.last_response):
                self.last_response = self.readline()
                if (datetime.now()-start_time).seconds > 1:
                    return self.sendMsg(args, try_number+1)
            return True
        
        else:
            return False


    def sendMsgWithReturn(self, args, try_number=0, debug=False) -> bool:
        
        if debug:
            print(f"Sending message: {args}")
        self.last_response = ""
        start_time = datetime.now()

        if self.connected:

            if try_number > 10:
                return False

            try:
                self.read_all()
                self.write(args + b'\r\n')

                # det the empty/useless line
                self.last_response = self.readline()
                if debug:
                    print(self.last_response)
                # Looking for echo (what was written in the console)
                # timeout if no echo
                while(not args in self.last_response):
                    self.last_response = self.readline()
                    if (datetime.now()-start_time).seconds > 1:
                        return self.sendMsgWithReturn(args, try_number+1)

                # now we can read response
                self.last_response = self.readline()
                if debug:
                    print(self.last_response)
                while(b'\x1b' in self.last_response):
                    self.last_response = self.readline()
                    if debug:
                        print(self.last_response)
                    if (datetime.now()-start_time).seconds > 1:
                        return self.sendMsgWithReturn(args, try_number+1)

                # remove artefact that could parasite response
                self.last_response = self.last_response.replace(b'>', b'')
                self.last_response = self.last_response.replace(b'\r\n', b'')
                self.last_response = self.last_response.replace(b'\r', b'')
                self.last_response = self.last_response.replace(b'\n', b'')
                self.last_response = self.last_response.replace(b' ', b'')
                return True

            except Exception as e:
                # print(str(e))
                return False

        return False


    def getInfo(self) -> dict[str, str]:

        deviceInfo = {"type": "undefined", "serialNum": "undefined", "hardwareVar": "undefined", "versionFw": "undefined"}

        if (self.sendMsgWithReturn(b'get-board-info -t')):
            deviceInfo["type"] = self.last_response.decode()
        if (self.sendMsgWithReturn(b'get-board-info -n')):
            deviceInfo["serialNum"] = self.last_response.decode()
        if (self.sendMsgWithReturn(b'get-board-info -h')):
            deviceInfo["hardwareVar"] = self.last_response.decode()
        if (self.sendMsgWithReturn(b'get-board-info -s')):
            deviceInfo["versionFw"] = self.last_response.decode()

        return deviceInfo
    
    def getSlaves(self):
        slaveInfo = []
        slaveSNList = []

        # return [{"port": "undefined", "type": "OIDiscrete", "serialNum": "0000008", "hardwareVar": "0", "versionSw": "1.0.1"}, {"port": "undefined", "type": "OIStepper", "serialNum": "0000010", "hardwareVar": "0", "versionSw": "1.0.0"}]

        if (self.sendMsgWithReturn(b'discover-slaves')):
            slaveSNList = json.loads(self.last_response.decode())

        for slaveSn in slaveSNList:
            deviceInfo = {"port": "undefined", "type": "undefined", "serialNum": "undefined", "hardwareVar": "undefined", "versionSw": "undefined"}
            if (self.sendMsgWithReturn(b'get-slave-info ' + str(slaveSn["type"]).encode() + b' ' + str(slaveSn["sn"]).encode() + b' -t')):
                deviceInfo["type"] = self.last_response.decode()
            if (self.sendMsgWithReturn(b'get-slave-info ' + str(slaveSn["type"]).encode() + b' '  + str(slaveSn["sn"]).encode() + b' -n')):
                deviceInfo["serialNum"] = self.last_response.decode()
            if (self.sendMsgWithReturn(b'get-slave-info ' + str(slaveSn["type"]).encode() + b' '  + str(slaveSn["sn"]).encode() + b' -h')):
                deviceInfo["hardwareVar"] = self.last_response.decode()
            if (self.sendMsgWithReturn(b'get-slave-info ' + str(slaveSn["type"]).encode() + b' '  + str(slaveSn["sn"]).encode() + b' -s')):
                deviceInfo["versionSw"] = self.last_response.decode()
            slaveInfo.append(deviceInfo)

        return slaveInfo
    
    def logLevel(self, level):
        return self.sendMsg(b'log ' + level.encode())

    def program(self, type, num):
        return self.sendMsg(b'program ' + str(type).encode() + b' ' + str(num).encode())
    
# serial = OISerial('COM17')
# serial.connect()
# deviceInfo = serial.getInfo()
# print(deviceInfo)

