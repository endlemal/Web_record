import json

from pyexpat.errors import messages

with open("message.json") as f:
    ms_obj = json.load(f)

def print_counter(t_lengths,m_lengths,c_lengths):

    from collections import Counter
    count_result = Counter(t_lengths)
    sorted_dict = dict(sorted(count_result.items(), key=lambda x: x[0], reverse=True))
    print("gameTime", sorted_dict)

    count_result = Counter(c_lengths)
    sorted_dict = sorted(count_result.items(), key=lambda x: x[0], reverse=True)
    print("color", sorted_dict)

    count_result = Counter(m_lengths)
    sorted_dict = sorted(count_result.items(), key=lambda x: x[0], reverse=True)
    print("matchResult", sorted_dict)

for i in range(10):
    m_lengths = []
    try:
        for item in ms_obj['data'][i]['RoomInfo']['data']['mpDetailList']:
            utime =item['matchResult']
            m_lengths.append(utime)
    except (KeyError, TypeError):
        m_lengths.append(0)
        print("原神nb")

    t_lengths = []
    try:
        for item in ms_obj['data'][i]['RoomInfo']['data']['mpDetailList']:
            utime =item['gameTime']
            t_lengths.append(utime)
    except (KeyError, TypeError):
        t_lengths.append(0)
        print("原神nb")

    c_lengths = []
    try:
        for item in ms_obj['data'][i]['RoomInfo']['data']['mpDetailList']:
            utime =item['color']
            c_lengths.append(utime)
    except (KeyError, TypeError):
        c_lengths.append(0)
        print("原神nb")



    print_counter(t_lengths,m_lengths,c_lengths) if c_lengths[-1]!=0 else print("结构错误")
    print(f"---------------------\033[1;34m 倒数第{i+1}局\033[0m----------------------------------")





