const { chromium } = require('playwright');
const XLSX = require('xlsx');
const { logger } = require('./logger');

const URL = "https://seller.wildberries.ru/discount-and-prices";
// const URL = "http://localhost:5173";

const selector = "[class~=\'ant-table-tbody-virtual-holder\']";
// const selector = "[class~=\'ant-table-tbody-virtual-holder-inner\']>div>div";
(async () => {
    try {
        logger.info("Start procces...")
        await dataHandler();
    } catch (error) {
        console.log(error);
        
        logger.info("Start error procces...")
        const contextVisible = await chromium.launchPersistentContext('./profile', {
            headless: false,
            channel: 'chrome'
        });

        const pageVisible = await contextVisible.newPage();
        await pageVisible.goto(URL);

        await pageVisible.waitForSelector('[class*="ant-table-cell"]', { timeout: 0 });
        contextVisible.close()

        await dataHandler()
    }
})();

async function dataHandler() {
    const context = await chromium.launchPersistentContext('./profile', {
        headless: true, // true
        channel: 'chrome'
    });

    const res = await getTableData(context);
    context.close();
    if (!res) {
        logger.error("dataHandler || Error");
        throw new Error()
    }
}

async function getTableData(context) {
    try {
        logger.info("getTableData || Version 3")
        
        const page = await context.newPage();
        const responsePromise = waitResponses(page);
        logger.warn(`---------------------------------------------`)

        await page.goto(URL);
        const [response] = await Promise.all([
            responsePromise,
            page.waitForSelector('[class*="ant-table-cell"]', { timeout: 10000 })
        ]);

        // page.waitForSelector('[class*="ant-table-cell"]', { timeout: 10000 }) // test

        logger.info("getTableData || Getting data")

        // Получаем заголовки таблицы
        const headers = await getTableHeaders(page);

        const pageScroll = (e) => {
            e.scrollBy(0, 150)
        }
        
        // test
        await page.locator(selector).evaluate(pageScroll);

        const tableData = [];
        let scrollHeightCount = 0;
        let previousHeight = 0;
        const scrollAndWait = async () => {   
            // test
            const newHeight = await page.evaluate(`document.querySelector("${selector}").scrollHeight`);            

            logger.info(`getTableData || newHeight ${newHeight}`)
            logger.info(`getTableData || previousHeight ${previousHeight}`)
            logger.info(`getTableData || scrollHeightCount ${scrollHeightCount}`)

            // test
            await page.locator(selector).evaluate(pageScroll);

            const currentData = await getTableFromData(page, headers)
            tableData.push(...currentData) 

            previousHeight += 150;

            if (previousHeight >= newHeight) {
                scrollHeightCount++
            } else {
                scrollHeightCount = 0;
            }

            if (scrollHeightCount > 5) {
                return false;
            }
            return true;
        }

        let hasMoreData = true;

        const currentData = await getTableFromData(page, headers)

        logger.info(`getTableData || Current loop Data | ${currentData.map(obj => JSON.stringify(obj)).join(', ')}`);
        tableData.push(...currentData) 
        
        while (hasMoreData) {
            hasMoreData = await scrollAndWait();
            await page.waitForTimeout(1000);
        }

        logger.info(`getTableData || Headers | ${headers}`)

        const uniqueArray = Array.from(
            new Set(tableData.map(item => JSON.stringify(item)))
        ).map(item => JSON.parse(item));

        
        logger.info("getTableData || Saving csv")

        logger.info(`getTableData || Data | ${uniqueArray.map(obj => JSON.stringify(obj)).join(', ')}`);

        // Сохраняем в CSV (который легко открывается в Excel)
        saveCSV(uniqueArray)

        logger.info("getTableData || End process");
        
        return true
    } catch (error) {
        logger.error("getTableData || Error", error);
        return false
    }
}

function waitResponses(page, count) {
    return page.waitForResponse(response => {
            const resUrl = response.url()
            logger.warn(`getTableData || Response ${resUrl}`)

            return response.url().includes('/goods/filter') && response.status() === 200;
        }, { timeout: 20000 });
}

async function getTableHeaders(page) {
    const arr = await page.$$eval(
            '[class*="ant-table-thead"] [class*="ant-table-cell"] [class*="Text__"]',
            headers => headers.map((header, index) => {
                
                let text = header.textContent.trim();
                text = text.replace(/\n/g, " ").replace(/\s+/g, ' ').trim();

                if (text === "Цвет") return null;

                return text.replace(/\s+/g, ' ').trim();
            }).filter(Boolean)
        );

    arr.splice(1, 0, "Артикул продавца");
    arr.splice(1, 0, "Артикул WB");
    arr.pop();
    arr.push("Цена для участии от","Цена для участии до");
    return arr;
}

async function getTableFromData(page, headers) {
    return await page.$$eval(
            '[class*="ant-table-tbody"] [class*="ant-table-row"]',
            
            (rows, headers) => {
                return rows.map(row => {
                    const cells = row.querySelectorAll('[class*="ant-table-cell"] [class*="Text__"]');
                    const rowData = {};
                    let count = 0;
                    cells.forEach((cell, index) => {
                        let text = cell.textContent.trim();
                        if (index < 3) {
                            if (rowData[headers[count] || `Column${count}`]) {
                                rowData[headers[count] || `Column${count}`] += `\n ${text}`;
                            } else {
                                rowData[headers[count] || `Column${count}`] = text;
                            }
                        } else if (index < 10) {
                            text = text.replace(/\n/g, "").replace(/\s+/g, '').trim();
                            text = text.replace(/[₽%]/g, '').trim();
                            count++;
                            rowData[headers[count] || `Column${count}`] = text;
                        } else if (index === 10) {
                            
                            text = text.replace(/\n/g, "").replace(/\s+/g, '').trim();
                            text = text.replace(/[₽%|до]/g, '').trim();
                            const [first, second] = text.split("–");

                            count++;
                            rowData[headers[count] || `Column${count}`] = first;
                            rowData[headers[count + 1] || `Column${count}`] = second;
                        }
                    });
                    
                    return rowData;
                });
            },
            headers
        );
}

function saveCSV(tableData) {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(tableData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Данные");
    XLSX.writeFile(workbook, 'wildberries_data.xlsx');
}