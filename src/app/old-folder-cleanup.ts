import { forgetBrowserFolderRecords } from '@/shared/lib/vault-folder/forget-browser-folder-records';

/**
 * The one script an app address carries in a plain browser. The address shows the page that says the app is
 * needed and runs no screen, so the cleanup a website page runs through its layout has no component to live in.
 */
void forgetBrowserFolderRecords();
