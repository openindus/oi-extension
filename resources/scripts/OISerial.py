import json
from serial import Serial
from time import sleep
from datetime import datetime

class OISerial(Serial):

    def __init__(self, port):
        super().__init__(baudrate=115200, timeout=0.1)
        self.dtr = False
        self.rts = True
        self.connected = False
        self.last_response = bytes()
        self.port = port
        self.prompt = str()


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
                # print(f"Prompt is {self.prompt}")
                return True
        
        except Exception as e:
                # print(str(e))
                return False
        
        return False
    

    def disconnect(self) -> None:

            if not self.connected:
                return
            self.close()
            self.connected = False

    
    def getPromt(self) -> str:

        self.dtr = True # reset device
        sleep(0.1) # wait for init
        self.write(b'console')
        sleep(0.1)
        self.flush()
        # check if init is OK
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


    def sendMsg(self, args, try_number) -> bool:

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


    def sendMsgWithReturn(self, args, try_number) -> bool:

        # print(f"Sending message: {args}")
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
                # Looking for echo (what was written in the console)
                # timeout if no echo
                while(not args in self.last_response):
                    self.last_response = self.readline()
                    if (datetime.now()-start_time).seconds > 1:
                        return self.sendMsgWithReturn(args, try_number+1)

                # now we can read response
                self.last_response = self.readline()
                while(b'\x1b' in self.last_response):
                    self.last_response = self.readline()
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

        deviceInfo = {"type": "undefined", "serialNum": "undefined", "versionHw": "undefined", "versionFw": "undefined"}

        if (self.sendMsgWithReturn(b'get-board-info --type', 0)):
            deviceInfo["type"] = self.last_response.decode()
        if (self.sendMsgWithReturn(b'get-board-info --serial-num', 0)):
            deviceInfo["serialNum"] = self.last_response.decode()
        if (self.sendMsgWithReturn(b'get-board-info --version-hw', 0)):
            deviceInfo["versionHw"] = self.last_response.decode()
        if (self.sendMsgWithReturn(b'get-board-info --version-sw', 0)):
            deviceInfo["versionFw"] = self.last_response.decode()

        return deviceInfo
    
    def getSlaves(self):
        slaveInfo = []
        slaveSNList = []

        return [{"port": "undefined", "type": "OIDiscrete", "serialNum": "0000008", "versionHw": "AD01", "versionFw": "1.0.1"}, {"port": "undefined", "type": "OIStepper", "serialNum": "0000010", "versionHw": "AD02", "versionFw": "1.0.0"}]

        if (self.sendMsgWithReturn(b'get-slave-list', 0)):
            slaveSNList = self.last_response.decode().split()
        slaveSNList.append("vvvsdf")
        for slaveSn in slaveSNList:
            deviceInfo = {"port": "undefined", "type": "undefined", "serialNum": "undefined", "versionHw": "undefined", "versionFw": "undefined"}
            if (self.sendMsgWithReturn(b'get-slave-info ' + slaveSn.encode() + b' --type', 0)):
                deviceInfo["type"] = self.last_response.decode()
            if (self.sendMsgWithReturn(b'get-slave-info ' + slaveSn.encode() + b' --serial-num', 0)):
                deviceInfo["serialNum"] = self.last_response.decode()
            if (self.sendMsgWithReturn(b'get-slave-info ' + slaveSn.encode() + b' --version-hw', 0)):
                deviceInfo["versionHw"] = self.last_response.decode()
            if (self.sendMsgWithReturn(b'get-slave-info ' + slaveSn.encode() + b' --version-sw', 0)):
                deviceInfo["versionFw"] = self.last_response.decode()
            slaveInfo.append(deviceInfo)

        return slaveInfo
    
# serial = OISerial('COM17')
# serial.connect()
# deviceInfo = serial.getInfo()
# print(deviceInfo)

