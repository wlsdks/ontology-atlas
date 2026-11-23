/** The index row that shows a tab's home: selected while the home is showing; pressing it leaves an open page. */
export interface IndexHomeRow {
  label: string;
  active: boolean;
  onPress: () => void;
}

/** Where focus lands after a page is left, so the next press can open another page from the list. */
export const INDEX_HOME_ROW_TEST_ID = "library-index-home";
