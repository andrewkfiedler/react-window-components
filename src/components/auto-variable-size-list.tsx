import * as React from "react";
import { VariableSizeList, ListChildComponentProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import _debounce from "lodash.debounce";

/**
 * Literally just so we can add 1px to the end of the list, to account for items with borders (otherwise they get chopped)
 */
const innerElementType = React.forwardRef(
  (
    { style, ...rest }: { style: React.CSSProperties & { height: string } },
    ref: React.RefObject<HTMLDivElement>
  ) => (
    <div
      ref={ref}
      style={{
        ...style,
        height: `${parseFloat(style.height) + 1}px`,
      }}
      {...rest}
    />
  )
);

/**
 * Explanation of the parts of this rather short but mildly complex component.
 *
 * visibleStartIndex is to track where we should scroll to when the element is resized.  Without this, scroll location is really funky when resizing things.
 * We also have to trigger at least one scroll upon resize since overscan is an unknown, and resizing might cause things to be blank.
 *
 * cachedItemSizes lets us have a dynamic height list without much work on part of users of this component.  Basically, we pass an itemRef to each
 * component.  Then each component gets measured at least once.  Every so often we remeasure (images might be loading, who knows) and if it needs updated,
 * we trigger an update.
 *
 * listRef is there so when cachedItemSizes update we can call upon the virtual list to have be rerendered.
 *
 * afterItemRef is so we know the latest index possible that needs to be rerendered when the cachedItemSizes update.
 * We set it to items.length + 1 to start, since we're constantly seeking a min until the next update.  Upon update,
 * we reset it to items.length + 1.  This keeps the performance up.
 */
export function AutoVariableSizeList<T, Z extends HTMLElement>({
  items,
  Item,
  Empty,
  defaultSize = 100,
  controlledMeasuring = {
    firstMeasure: 100,
    measureDebounce: 100,
  },
  updateDebounce = 100,
  overscanCount = 0,
}: {
  items: T[];
  Item: React.ElementType<{
    item: T;
    index: number;
    itemRef: React.RefObject<Z>;
    measure: () => void;
  }>;
  Empty: React.ElementType<{}>;
  defaultSize?: number;
  controlledMeasuring:
    | true
    | {
        firstMeasure?: number;
        measureDebounce?: number;
      };
  updateDebounce?: number;
  overscanCount?: number;
}) {
  const visibleStartIndexRef = React.useRef(0);
  const isEmpty = items.length === 0;
  const cachedItemSizes = React.useRef(
    {} as {
      [key: string]: number;
    }
  );
  const listRef = React.useRef<VariableSizeList>(null);
  const afterIndexRef = React.useRef(items.length + 1);
  const rangeRef = React.useRef(
    {} as {
      [key: string]: true;
    }
  );

  const updateSizes = React.useMemo(() => {
    return _debounce(() => {
      if (listRef.current) {
        const rangeStart = Object.keys(rangeRef.current)
          .map((val) => parseInt(val))
          .sort()[0];
        console.log(`update: ${rangeStart} ${afterIndexRef.current}`);
        listRef.current.resetAfterIndex(
          Math.min(rangeStart, afterIndexRef.current),
          true
        );
        afterIndexRef.current = listRef.current.props.itemCount + 1;
      }
    }, updateDebounce);
  }, []);

  const Row = React.useMemo(() => {
    return ({ index, style }: ListChildComponentProps) => {
      const item = items[index];
      const itemRef = React.useRef<Z>(null);

      const updateCachedSize = () => {
        if (itemRef.current) {
          if (cachedItemSizes.current[index] !== itemRef.current.clientHeight) {
            cachedItemSizes.current[index] = itemRef.current.clientHeight;
            afterIndexRef.current = Math.min(index, afterIndexRef.current);
            updateSizes();
          }
        }
      };

      React.useLayoutEffect(() => {
        rangeRef.current[index] = true;
        let intervalId = undefined as undefined | number;
        let firstMeasureTimeoutId = undefined as undefined | number;
        if (controlledMeasuring !== true) {
          const { measureDebounce, firstMeasure } = controlledMeasuring;
          firstMeasureTimeoutId = setTimeout(() => {
            updateCachedSize();
            intervalId = setInterval(() => {
              updateCachedSize();
            }, measureDebounce);
          }, firstMeasure);
        }

        return () => {
          clearTimeout(firstMeasureTimeoutId);
          clearInterval(intervalId);
          delete rangeRef.current[index];
        };
      }, []);

      React.useEffect(() => {
        /**
         * Regardless of mode, we should be updating cached size on resize.  This if statement though should
         * cover most cases of controlled measuring, since it prevents updating cached size until the initial
         * measurement is done.
         */
        if (cachedItemSizes.current[index] !== undefined) {
          updateCachedSize();
        }
      }, [style]);

      return (
        <>
          <div
            style={{
              ...style,
              overflow: "visible",
            }}
          >
            <Item
              index={index}
              item={item}
              itemRef={itemRef}
              measure={updateCachedSize}
            />
          </div>
        </>
      );
    };
  }, [items]);

  const getItemSize = React.useMemo(() => {
    return (index: number) => {
      return cachedItemSizes.current[index] || defaultSize;
    };
  }, []);

  const MemoList = React.useMemo(() => {
    return (
      <div style={{ width: "100%", height: "100%" }}>
        <AutoSizer>
          {({ height, width }) => {
            // to avoid setState within a render, push to end of stack
            setTimeout(() => {
              if (listRef.current)
                listRef.current.scrollToItem(visibleStartIndexRef.current);
            }, 0);

            return (
              <VariableSizeList
                ref={listRef}
                height={height}
                width={width}
                itemCount={items.length}
                itemSize={getItemSize}
                overscanCount={overscanCount}
                onItemsRendered={({ visibleStartIndex }) => {
                  visibleStartIndexRef.current = visibleStartIndex;
                }}
                innerElementType={innerElementType}
              >
                {Row}
              </VariableSizeList>
            );
          }}
        </AutoSizer>
      </div>
    );
  }, [items]);

  if (isEmpty) {
    return <Empty />;
  } else {
    return MemoList;
  }
}
