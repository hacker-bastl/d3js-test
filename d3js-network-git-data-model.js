// https://developer.github.com/v3/git/#git-data
var REST = '//api.github.com/repos/' + 'hacker-bastl/d3js-test';

// https://developer.github.com/v3/git/refs/#get-all-references
d3.json(REST + '/git/refs/heads', function(error, heads) {
  if (!!error) throw error;
  heads.forEach(function(head) {

    // GRAY NODE
    console.log(head);
    console.info({
      id: head.object.sha.substring(0, 6),
      title: head.ref,
      type: 'reference',
      fill: '#dbdfd3',
      stroke: '#3c3d3a',
    });

    // https://developer.github.com/v3/git/commits/#get-a-commit
    d3.json(REST + '/git/commits/' + head.object.sha, function(error, commit) {
      if (!!error) throw error;

      // GREEN NODE
      console.log(commit);
      console.info({
        id: commit.sha.substring(0, 6),
        title: commit.message,
        type: 'commit',
        fill: '#93ffa3',
        stroke: '#063c0f',
      });

      // https://developer.github.com/v3/git/trees/#get-a-tree-recursively
      d3.json(REST + '/git/trees/' + commit.sha + '?recursive=1', function(error, tree) {
        if (!!error) throw error;

        // purple node
        console.log(tree);
        console.info({
          id: commit.tree.sha.substring(0, 6),
          title: commit.message,
          type: 'tree',
          fill: '#d1cdff',
          stroke: '#02093e',
        });

        // https://developer.github.com/v3/git/blobs/#get-a-blob
        tree.tree.forEach(function(child) {

          // red node
          console.log(child);
          console.info({
            id: child.sha.substring(0, 6),
            title: child.path,
            type: 'blob',
            fill: '#ffbcba',
            stroke: '#550001',
          });

        });
      });
    });
  });
});
