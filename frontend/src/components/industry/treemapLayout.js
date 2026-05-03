// ========================================
// Squarified Treemap 算法
// ========================================

/**
 * 计算一组行在当前 rect 中的布局
 * @param {Array} row - 当前行的数据项 (已含 normalizedSize)
 * @param {number} w - 当前短边长度
 * @returns {number} 最差纵横比
 */
export function worstAspectRatio(row, w) {
    if (row.length === 0 || w <= 0) return Infinity;
    const s = row.reduce((acc, r) => acc + r.normalizedSize, 0);
    const maxArea = Math.max(...row.map(r => r.normalizedSize));
    const minArea = Math.min(...row.map(r => r.normalizedSize));
    return Math.max(
        (w * w * maxArea) / (s * s),
        (s * s) / (w * w * minArea)
    );
}

/**
 * Squarified Treemap 核心递归算法
 * 将 items 递归地排列到 rect 中
 */
export function squarify(items, rect) {
    if (items.length === 0) return [];
    if (items.length === 1) {
        return [{ ...items[0], layout: { ...rect } }];
    }

    const { x, y, width, height } = rect;
    const totalArea = width * height;
    const totalSize = items.reduce((acc, item) => acc + item.normalizedSize, 0);

    if (totalSize <= 0 || totalArea <= 0) {
        return items.map(item => ({ ...item, layout: { x, y, width: 0, height: 0 } }));
    }

    // 归一化面积到像素面积
    const scale = totalArea / totalSize;
    const scaledItems = items.map(item => ({
        ...item,
        normalizedSize: item.normalizedSize * scale
    }));

    let currentRow = [];
    let remaining = [...scaledItems];
    let results = [];
    let currentRect = { ...rect };

    while (remaining.length > 0) {
        const isWide = currentRect.width >= currentRect.height;
        const shortSide = isWide ? currentRect.height : currentRect.width;
        const item = remaining[0];
        const testRow = [...currentRow, item];
        const currentWorst = worstAspectRatio(currentRow, shortSide);
        const testWorst = worstAspectRatio(testRow, shortSide);

        if (currentRow.length === 0 || testWorst <= currentWorst) {
            currentRow.push(item);
            remaining.shift();
        } else {
            // 固定当前行，递归处理剩余
            const rowResults = layoutRow(currentRow, currentRect, isWide);
            results.push(...rowResults.items);
            currentRect = rowResults.remainingRect;
            currentRow = [];
        }
    }

    // 最后一行
    if (currentRow.length > 0) {
        const isWide = currentRect.width >= currentRect.height;
        const rowResults = layoutRow(currentRow, currentRect, isWide);
        results.push(...rowResults.items);
    }

    return results;
}

/**
 * 在 rect 中排列一行
 */
export function layoutRow(row, rect, isWide) {
    const { x, y, width, height } = rect;
    const rowArea = row.reduce((acc, r) => acc + r.normalizedSize, 0);
    const items = [];

    if (isWide) {
        const rowWidth = rowArea / height;
        let offsetY = y;
        for (const item of row) {
            const itemHeight = item.normalizedSize / rowWidth;
            items.push({
                ...item,
                layout: {
                    x: x,
                    y: offsetY,
                    width: Math.max(rowWidth, 0),
                    height: Math.max(itemHeight, 0)
                }
            });
            offsetY += itemHeight;
        }
        return {
            items,
            remainingRect: {
                x: x + rowWidth,
                y,
                width: Math.max(width - rowWidth, 0),
                height
            }
        };
    } else {
        const rowHeight = rowArea / width;
        let offsetX = x;
        for (const item of row) {
            const itemWidth = item.normalizedSize / rowHeight;
            items.push({
                ...item,
                layout: {
                    x: offsetX,
                    y: y,
                    width: Math.max(itemWidth, 0),
                    height: Math.max(rowHeight, 0)
                }
            });
            offsetX += itemWidth;
        }
        return {
            items,
            remainingRect: {
                x,
                y: y + rowHeight,
                width,
                height: Math.max(height - rowHeight, 0)
            }
        };
    }
}
