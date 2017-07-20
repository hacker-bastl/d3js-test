// https://github.com/hacker-bastl/git-api-d3js-test#readme
const graph = window.graph || {
  cached: {},
};

// TODO: refactor, this is redundant w/ d3 data model?
graph.cached = {
  nodes: new Array(),
  links: new Array(),
  ids: new Map(),
};

// https://bl.ocks.org/mbostock/1095795
graph.canvas = d3.select('svg').append('g');

// persistent pointers to graph nodes
graph.nodes = graph.canvas.selectAll('g');
graph.links = graph.canvas.selectAll('line');

// https://github.com/d3/d3-force/#forceSimulation
graph.layout = d3.forceSimulation(graph.cached.nodes)
  .force('x', d3.forceX()).force('y', d3.forceY()).alphaTarget(1)
  // https://github.com/d3/d3-force/#link_distance
  .force('link', d3.forceLink(graph.cached.links).distance(5 * 30))
  // https://github.com/d3/d3-force/#manyBody_strength
  .force('charge', d3.forceManyBody().strength(10 * -30));

// https://github.com/d3/d3-force/#simulation_tick
graph.layout.on('tick', function() {
  graph.nodes
    .attr('transform', function(d) {
      return 'translate(' + d.x + ',' + d.y + ')';
    });
  graph.links
    .attr('x1', function(d) {
      return d.source.x;
    })
    .attr('y1', function(d) {
      return d.source.y;
    })
    .attr('x2', function(d) {
      return d.target.x;
    })
    .attr('y2', function(d) {
      return d.target.y;
    });
});

// https://github.com/d3/d3-zoom#zoom
graph.zoom = 1;
d3.select('svg').call(d3.zoom()
  .scaleExtent([0.2, 2.0])
  .on('zoom', function() {
    graph.zoom = d3.event.transform.k;
    graph.rescale();
  }));

// https://github.com/d3/d3-drag#drag
graph.canvas.call(d3.drag()
  .subject(function() {
    var x = d3.event.x - window.innerWidth / 2;
    var y = d3.event.y - window.innerHeight / 2;
    return graph.layout.find(x, y);
  })
  .on('start', function() {
    if (!d3.event.active) graph.layout.alphaTarget(1).restart();
    d3.event.subject.fx = d3.event.subject.x;
    d3.event.subject.fy = d3.event.subject.y;
  })
  .on('drag', function() {
    d3.event.subject.fx = d3.event.x;
    d3.event.subject.fy = d3.event.y;
  })
  .on('end', function() {
    if (!d3.event.active) graph.layout.alphaTarget(0);
    d3.event.subject.fx = null;
    d3.event.subject.fy = null;
  }));

// update overall size and transformation
graph.rescale = function() {
  d3.select('svg').attr('x', 0).attr('y', 0)
    .attr('width', window.innerWidth).attr('height', window.innerHeight);
  graph.canvas.attr('transform',
    'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') ' +
    'scale(' + graph.zoom + ')');
};

// update transformation on resize
d3.select(window).on('resize', graph.rescale);
graph.rescale();

// https://bl.ocks.org/mbostock/3808218
graph.update = function() {
  graph.nodes = graph.nodes
    .data(graph.cached.nodes, function(d) {
      return d.sha || d.id; // TODO?
    });
  graph.nodes.exit().remove();
  graph.nodes = graph.nodes.enter()
    .append('g').merge(graph.nodes);

  // TODO: "dynamic" size and color?
  graph.nodes.append('circle')
    .on('click', graph.click)
    .attr('r', 20).attr('r', 20)
    .attr('dx', -10).attr('dy', -10);

  // append avatar image
  graph.nodes.append('image')
    .attr('x', -20).attr('y', -20)
    .attr('width', 40).attr('height', 40)
    .attr('xlink:href', graph.avatar)
    .on('click', graph.click);

  // TODO: change this on updated nodes?
  graph.nodes.append('a')
    .attr('target', '_new')
    .attr('xlink:href', function(d) {
      return !!d.html_url ? d.html_url : '#';
    })
    .attr('xlink:title', function(d) {
      return JSON.stringify(d, null, 4);
    })
    .on('click', function(d) {
      if (d3.event.button < 1 &&
        !d3.event.altKey && !d3.event.ctrlKey && !d3.event.shiftKey) {
        d3.event.preventDefault();
        graph.click(d);
      }
    })
    .append('text')
    .text(function(d) {
      return !!d.name ? d.name :
        !!d.message ? d.message :
        !!d.path ? d.path :
        !!d.sha ? d.sha.substring(0, 8) : // TODO
        d.id;
    });

  // update links
  graph.links = graph.links
    .data(graph.cached.links, function(d) {
      return d.source.id + '-' + d.target.id;
    });
  graph.links.exit().remove();
  graph.links = graph.links.enter()
    .insert('line', 'g').merge(graph.links);

  // restart layout
  graph.layout.nodes(graph.cached.nodes);
  graph.layout.force('link').links(graph.cached.links);
  graph.layout.alpha(1).restart();
};

// https://www.webpagefx.com/tools/emoji-cheat-sheet/
graph.avatar = function(d) {
  return !!d.avatar_url ? d.avatar_url :
    '//assets-cdn.github.com/images/icons/' + ({
      'commit': 'emoji/unicode/1f69a.png',
      'head': 'emoji/unicode/1f4cd.png',
      'blob': 'emoji/unicode/1f4dd.png',
      'tree': 'emoji/unicode/1f4c2.png',
      'organization': 'emoji/unicode/1f465.png',
      'repository': 'emoji/unicode/1f4e6.png',
      'user': 'emoji/unicode/1f464.png',
      'date': 'emoji/unicode/1f4c6.png',
    }[(d.type || '').toLowerCase()] || 'emoji/octocat.png');
};

// https://github.com/d3/d3-request#json
graph.load = function(url, callback) {
  if (!url.startsWith('http')) url = 'https://api.github.com' + url;
  var request = d3.json(url).on('load', callback)
    .on('error', function(event) {
      var message = event.target.statusText || 'REQUEST ERROR';
      try {
        message = JSON.parse(event.target.responseText).message;
      } catch (failed) {}
      console.warn(message, url);
      // TODO: alert makes sense?
      setTimeout(function() {
        alert(message);
      }, 1E2);
    });
  var token = localStorage.getItem('GIT-TOKEN');
  if (!!token) request.header('Authorization', 'Token ' + token);
  request.send('GET');
};

// search on change of text in input box (and throttle user input)
graph.input = {
  node: document.querySelector('[role=search]>input[type=text]'),
  delay: setTimeout(function() {
    graph.input.node.addEventListener('keyup', function() {
      window.clearTimeout(graph.input.delay);
      var searchterm = graph.input.node.value.trim();
      graph.input.delay = window.setTimeout(function() {
        graph.search(searchterm);
      }, 2E3);
    });
  }, 2E3),
};

// TODO: refactor, this is redundant w/ d3 data model?
graph.clear = function() {
  while (graph.cached.links.length > 0)
    delete(graph.cached.links.pop());
  while (graph.cached.nodes.length > 0)
    delete(graph.cached.nodes.pop());
  graph.cached.ids.clear();
  graph.update();
};

// TODO: refactor, this is redundant w/ d3 data model?
graph.dataset = function(dataset, type) {
  if (!dataset.id)
    if (!!dataset.sha) dataset.id = dataset.sha; // TODO
    else throw new ReferenceError('no data id');
  if (typeof type == 'string') dataset.type = type;
  if (graph.cached.ids.has(dataset.id)) {
    var cached = graph.cached.ids.get(dataset.id);
    // TODO: smells (this is shallow copy only!)
    for (var key in dataset)
      if (!cached[key])
        cached[key] = dataset[key];
    return cached;
  } else {
    graph.cached.ids.set(dataset.id, dataset);
    graph.cached.nodes.push(dataset);
    return dataset;
  }
};

// https://github.com/d3/d3-dispatch/blob/master/README.md#dispatch
graph.expand = d3.dispatch('user', 'repository', 'head', 'commit', 'tree', 'blob');

// TODO: refactor!
graph.expand.on('repository', function(expand) {
  var head_refs = expand.dataset.git_refs_url.replace(/\{\/sha\}$/, '/heads');
  graph.load(head_refs, function(heads) {
    heads.forEach(function(head) {
      head.id = expand.dataset.name + ':' + head.ref;
      head.name = head.ref.substring(11); // TODO?
      head.type = 'head';
      expand.connect(head);
    });
    graph.update();
  });
  graph.load(expand.dataset.owner.url, function(owner) {
    expand.connect(owner);
    graph.update();
  });
});

// TODO: refactor!
graph.expand.on('head', function(expand) {
  graph.load(expand.dataset.object.url, function(commit) {
    expand.connect(commit, 'commit');
    graph.update();
  });
});

// TODO: refactor!
graph.expand.on('commit', function(expand) {
  expand.dataset.parents.forEach(function(parent) {
    graph.load(parent.url, function(commit) {
      expand.connect(commit, 'commit');
      graph.update();
    });
  });
  graph.load(expand.dataset.tree.url, function(response) {
    expand.connect(response.tree);
    graph.update();
  });
});

// TODO: refactor!
graph.expand.on('tree', function(expand) {
  expand.connect(expand.dataset.tree);
  graph.update();
});

// TODO: refactor!
graph.expand.on('blob', function(expand) {
  alert(atob(expand.dataset.content));
});

// TODO: refactor!
graph.click = function(dataset, type) {
  console.log(dataset);
  if (!!dataset.expanded) return;
  graph.load(dataset.url, function(response) {
    Object.assign(dataset, response); // TODO!?!?
    dataset.expanded = true;

    var source = graph.dataset(dataset, type);
    var expander = {
      dataset: dataset,
      connect: function(neighbor, type) {
        if (neighbor instanceof Array)
          return neighbor.forEach(arguments.callee); // TODO
        var target = graph.dataset(neighbor, type);
        graph.cached.links.push({
          target: target,
          source: source,
        });
      },
    };

    var type = (dataset.type || 'undefined').toLowerCase();
    graph.expand.call(type, {
      // TODO?
    }, expander);
  });
};

// https://developer.github.com/v3/search/#search-repositories
graph.search = function(text) {
  graph.clear();
  graph.load('/search/repositories?per_page=4&q=' + text, function(response) {
    response.items.forEach(function(repo) {
      graph.dataset(repo, 'Repository');
    });
    graph.update();
  });
};

// https://developer.github.com/v3/activity/events/#list-public-events
graph.load('/events?per_page=4', function(events) {
  events.forEach(function(event) {
    graph.cached.links.push({
      source: graph.dataset(event.actor, 'User'),
      target: graph.dataset(event.repo, 'Repository'),
    });
  });
  graph.update();
});
