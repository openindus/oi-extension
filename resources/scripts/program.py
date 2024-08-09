

import json
import sys
from OISerial import OISerial

# open port
print(sys.argv[1] + " | TYPE" +  sys.argv[2] + " | SN" +  sys.argv[3])
com = OISerial(sys.argv[1])

if (com.connect()):

    # Desactivate log
    if (com.logLevel("NONE") == False):
        com.disconnect()
        exit(-1)

    # send program command to slave
    if (com.program(sys.argv[2], sys.argv[3]) == False):
        com.disconnect()
        exit(-1)

    com.disconnect()
    exit(0)

exit(-1)