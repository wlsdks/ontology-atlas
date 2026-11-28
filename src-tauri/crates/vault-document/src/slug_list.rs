//! The slugs one name may mean, in the order they were added. Nearly every name means one slug,
//! which is held as it is; a list is made only for a name that means several. An index of fifty
//! thousand names then holds no fifty thousand lists, each its own allocation, made and dropped on
//! every call.

#[derive(Debug, Clone)]
pub enum SlugList<'a> {
    One(&'a str),
    Several(Vec<&'a str>),
}

impl<'a> SlugList<'a> {
    pub fn push(&mut self, slug: &'a str) {
        match self {
            Self::One(first) => *self = Self::Several(vec![*first, slug]),
            Self::Several(slugs) => slugs.push(slug),
        }
    }

    pub fn as_slice(&self) -> &[&'a str] {
        match self {
            Self::One(slug) => std::slice::from_ref(slug),
            Self::Several(slugs) => slugs,
        }
    }

    pub fn as_mut_slice(&mut self) -> &mut [&'a str] {
        match self {
            Self::One(slug) => std::slice::from_mut(slug),
            Self::Several(slugs) => slugs,
        }
    }
}
