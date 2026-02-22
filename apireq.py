import requests
import csv
import datetime

filename = "tips.csv"
default = {}
baseUrl = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'
summary_endpoint = '/v1/accounting/od/tips_cpi_data_summary'
details_endpoint = '/v1/accounting/od/tips_cpi_data_detail'
sfields = ["cusip", "interest_rate", "security_term", "series", "original_issue_date", "maturity_date"]
ifields = ["index_date", "index_ratio"]
my_tips = []

def get_all_tips():
    print("Getting summary TIPS data...")
    API = baseUrl + summary_endpoint
    parstring = ""
    response = requests.get(API + parstring)
    tips_list = response.json()["data"]
    return tips_list

def get_indexes(the_date):
    print("Getting index details ...")
    API = baseUrl + details_endpoint
    parstring = f"?filter=index_date:eq:{the_date}"
    response = requests.get(API + parstring)
    index_list = response.json()["data"]
    return index_list

def find_index(cusip, index_list):
    for index_item in index_list:
        if index_item["cusip"] == cusip:
            return index_item
    return default

def writefile(tips):
    print("Writing csv file ...")
    with open(filename, 'w') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames = tips[0].keys())
        writer.writeheader()
        writer.writerows(tips)

def main():
    idate = datetime.datetime.now().strftime('%Y-%m-%d')
    tips_list = get_all_tips()
    print ("Total tips received :", len(tips_list))
    # go thru recovered fields and place selected ones in my_tips
    for tip in tips_list:
        my_tip = {}
        for fieldname in sfields:
            my_tip[fieldname] = tip.get(fieldname)
        my_tips.append(my_tip)
    index_list = get_indexes(idate)
    print ("total indexes received: ", len(index_list))
    # go thru tips and search for and recover index info
    for tip in my_tips:
        index = find_index(tip["cusip"], index_list)
        tip["index_ratio"] = index.get("index_ratio")
        tip["index_date"] = index.get("index_date")
        if tip["index_ratio"]:
            tip["adjusted_principal"] = int(float(tip["index_ratio"]) * 100000) / 100
        else:
            tip["adjusted_principal"] = None
    writefile(my_tips)
    print("All done.")

if __name__ == "__main__":
    main()