//! Files as nested folders, each folder with the files and lines beneath it. An arena with no
//! recursion: a tree thousands of folders deep costs what a flat one does.

use std::collections::HashMap;

/// A file as the tree holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeFile {
    pub path: String,
    pub lines: usize,
}

#[derive(Debug, Clone)]
pub struct Folder {
    /// Below the root, `/`-separated; empty for the root.
    pub path: String,
    pub files: Vec<TreeFile>,
    /// Indexes of the subfolders, in the order their first file was added.
    pub children: Vec<usize>,
    /// Files and lines beneath this folder, its own and its subfolders'.
    pub total: usize,
    pub lines: usize,
    by_name: HashMap<String, usize>,
}

#[derive(Debug, Clone)]
pub struct FolderTree {
    folders: Vec<Folder>,
}

pub const ROOT: usize = 0;

impl FolderTree {
    /// The tree of `files`, in the order given: O(files x depth).
    pub fn of(files: &[TreeFile]) -> Self {
        let mut tree = Self {
            folders: vec![Self::folder(String::new())],
        };
        for file in files {
            let mut at = ROOT;
            tree.count(at, file.lines);
            let mut parts: Vec<&str> = file.path.split('/').collect();
            parts.pop();
            for part in parts {
                at = tree.child(at, part);
                tree.count(at, file.lines);
            }
            if let Some(folder) = tree.folders.get_mut(at) {
                folder.files.push(file.clone());
            }
        }
        tree
    }

    fn folder(path: String) -> Folder {
        Folder {
            path,
            files: Vec::new(),
            children: Vec::new(),
            total: 0,
            lines: 0,
            by_name: HashMap::new(),
        }
    }

    fn count(&mut self, at: usize, lines: usize) {
        if let Some(folder) = self.folders.get_mut(at) {
            folder.total += 1;
            folder.lines += lines;
        }
    }

    fn child(&mut self, parent: usize, name: &str) -> usize {
        if let Some(existing) = self
            .folders
            .get(parent)
            .and_then(|folder| folder.by_name.get(name))
        {
            return *existing;
        }
        let path = match self.folders.get(parent) {
            Some(folder) if !folder.path.is_empty() => format!("{}/{name}", folder.path),
            _ => name.to_string(),
        };
        let created = self.folders.len();
        self.folders.push(Self::folder(path));
        if let Some(folder) = self.folders.get_mut(parent) {
            folder.children.push(created);
            folder.by_name.insert(name.to_string(), created);
        }
        created
    }

    pub fn get(&self, at: usize) -> Option<&Folder> {
        self.folders.get(at)
    }

    /// The folder's own files, then each subfolder's files in turn.
    pub fn files_beneath(&self, at: usize) -> Vec<TreeFile> {
        let mut out = Vec::new();
        let mut stack = vec![at];
        while let Some(current) = stack.pop() {
            let Some(folder) = self.folders.get(current) else {
                continue;
            };
            out.extend(folder.files.iter().cloned());
            stack.extend(folder.children.iter().rev());
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, lines: usize) -> TreeFile {
        TreeFile {
            path: path.to_string(),
            lines,
        }
    }

    #[test]
    fn a_folder_counts_every_file_and_line_beneath_it() {
        let tree = FolderTree::of(&[file("a/b/x.ts", 3), file("a/y.ts", 4), file("z.ts", 5)]);
        let root = tree.get(ROOT).expect("root");
        assert_eq!((root.total, root.lines), (3, 12));
        let a = tree.get(root.children[0]).expect("a");
        assert_eq!((a.path.as_str(), a.total, a.lines), ("a", 2, 7));
        assert_eq!(
            tree.files_beneath(ROOT)
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>(),
            ["z.ts", "a/y.ts", "a/b/x.ts"]
        );
    }

    #[test]
    fn a_tree_four_thousand_folders_deep_is_built_without_recursion() {
        let deep = format!("{}f.ts", "d/".repeat(4_000));
        let tree = FolderTree::of(&[file(&deep, 1)]);
        assert_eq!(tree.files_beneath(ROOT).len(), 1);
    }
}
