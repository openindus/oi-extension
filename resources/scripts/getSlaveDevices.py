

import json
import sys
from OISerial import OISerial

data = []

# open port
# print(sys.argv[1])
com = OISerial(sys.argv[1])

if (com.connect()):
    data = com.getSlaves()
    com.disconnect()
    print(json.dumps(data))
    exit(0)

exit(-1)