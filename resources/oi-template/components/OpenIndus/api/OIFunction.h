/**
 * Copyright (C) OpenIndus, Inc - All Rights Reserved
 *
 * This file is part of OpenIndus Library.
 *
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * 
 * @file OIFunction.h
 * @brief OpenIndus function table
 *
 * For more information on OpenIndus:
 * @see https://openindus.com
 */

#pragma once

#include <stdint.h>
#include <functional>
#include <string>
#include <map>

#include "OIMessage.h"

typedef std::function<uint32_t(OIMessage msg)> OICommand;


class OIFunction
{
    std::multimap<OIMessage, OICommand> _commandTable;

public:

    inline void add(OIMessage const& msg, OICommand function)
    {
        _commandTable.insert(
            std::multimap<OIMessage, OICommand>::value_type(
                msg, 
                function
            )
        );
    }

    inline void remove(OIMessage const& msg)
    {
        _commandTable.erase(msg);
    }

    inline bool exist(OIMessage const& msg)
    {
        if (_commandTable.find(msg) != _commandTable.end()) {
            return true;
        }
        else {
            return false;
        }
    }

    inline uint32_t run(OIMessage const& msg)
    {
        for (auto it=_commandTable.equal_range(msg).first; it!=_commandTable.equal_range(msg).second; ++it)
        {
            if (_commandTable.count(msg) > 1)
            {
                if ((*it).first.getId() == msg.getId())
                {
                    return (*it).second(msg);
                }
            }
            else 
            {
                return (*it).second(msg);
            }
        }
        return 0;
    }

    inline void list(void)
    {
        for (auto it=_commandTable.begin(); it!=_commandTable.end(); ++it)
        {
            printf("Type: %d, Id: %d\n", it->first.getType(), it->first.getId());
        }
    }
};

extern OIFunction FUNCTION;