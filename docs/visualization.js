var githubModel = {
  network: {
    ids: new Map(),
    nodes: [],
    links: [],
  },

  unique: function(data, type) {
    if (!data.id) {
      console.warn(data);
      console.error('data id missing');
      data.id = String(Math.random()).slice(-8);
    }

    if (!!type) data.type = type;
    if (!data.type) data.type = 'unknown';

    if (githubModel.network.ids.has(data.id)) {
      // TODO: performance here? refactor?
      var existing = githubModel.network.ids.get(data.id);
      // for (var key in data) existing[key] = data[key];
      return existing;
    } else {
      githubModel.network.ids.set(data.id, data);
      githubModel.network.nodes.push(data);
      return data;
    }
  },

  connection: function(data, type) {
    var connection = {
      source: githubModel.unique(data, type),
      timestamp: function(timestamp) {
        var date = (timestamp || 'unknown').substring(0, 10);
        if (date.length != 10) console.warn(timestamp); // TODO
        var node = githubModel.unique({
          name: date,
          id: date,
        }, 'date');
        return connection.connect(node);
      },
      connect: function(data, type) {
        githubModel.network.links.push({
          target: githubModel.unique(data, type),
          source: connection.source,
        });
        return connection;
      },
    };
    return connection;
  },

  clear: function() {
    while (githubModel.network.links.length > 0)
      delete(githubModel.network.links.pop());
    while (githubModel.network.nodes.length > 0)
      delete(githubModel.network.nodes.pop());
    githubModel.network.ids.clear();
    return githubModel;
  },

  repository: function(data) {
    var repo = githubModel.connection(data, 'repo');

    repo.timestamp(data.updated_at || data.created_at);

    data.owner.name = data.owner.login;
    repo.connect(data.owner, 'user');
    return repo;
  },

  event: function(data) {
    var event = githubModel.connection(data, 'event');

    event.timestamp(data.updated_at || data.created_at);

    if (!!data.actor) {
      data.actor.name = data.actor.login;
      event.connect(data.actor, 'user');
    }
    if (!!data.repo)
      event.connect(data.repo, 'repo');
    if (!!data.org) {
      data.org.name = data.org.login;
      event.connect(data.org, 'orga');
    }
    //    if (!!data.payload)
    //      event.connect(data.payload);
    return event;
  },
};

// https://bl.ocks.org/mbostock/1095795 / GPLv3
var networkGraph = new function() {

  var root = d3.select('svg').attr('x', 0).attr('y', 0).attr('width', window.innerWidth).attr('height', window.innerHeight);
  var canvas = root.append('g').attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ')');
  var zoom = 1; // TODO: smells...

  this.links = canvas.selectAll('line');
  this.nodes = canvas.selectAll('g');

  // http://bl.ocks.org/aaizemberg/78bd3dade9593896a59d
  this.color = d3.scaleOrdinal(d3.schemeCategory20c);

  d3.select(window).on('resize', function() {
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
    root.attr('width', window.innerWidth).attr('height', window.innerHeight);
  });

  // https://github.com/d3/d3-zoom#zoom
  root.call(d3.zoom().scaleExtent([0.2, 2.0]).on('zoom', function() {
    zoom = d3.event.transform.k;
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
  }));
};

// https://github.com/d3/d3-force/#forceSimulation
networkGraph.layout = d3.forceSimulation(githubModel.network.nodes)
  .force('x', d3.forceX()).force('y', d3.forceY()).alphaTarget(1)
  // https://github.com/d3/d3-force/#manyBody_strength
  .force('charge', d3.forceManyBody().strength(10 * -30))
  // https://github.com/d3/d3-force/#link_distance
  .force('link', d3.forceLink(githubModel.network.links).distance(5 * 30))
  // https://github.com/d3/d3-force/#simulation_tick
  .on('tick', function() {
    networkGraph.nodes.attr('transform', function(d) {
      return 'translate(' + d.x + ',' + d.y + ')';
    });
    networkGraph.links.attr('x1', function(d) {
      return d.source.x;
    }).attr('y1', function(d) {
      return d.source.y;
    }).attr('x2', function(d) {
      return d.target.x;
    }).attr('y2', function(d) {
      return d.target.y;
    });
  });

// https://bl.ocks.org/mbostock/3808218
networkGraph.update = function() {
  networkGraph.nodes = networkGraph.nodes.data(githubModel.network.nodes, function(d) {
    return d.id;
  });
  networkGraph.nodes.exit().remove();
  networkGraph.nodes = networkGraph.nodes.enter().append('g').merge(networkGraph.nodes);

  // TODO: use avatar instead?
  networkGraph.nodes.append('circle').attr('fill', function(d) {
    return networkGraph.color(d.type || d.id);
  }).attr('r', 8);

  networkGraph.nodes.append('text').text(function(d) {
    return d.name || d.type || d.id;
  }).attr('y', '0.5em');

  networkGraph.nodes.on('click', networkGraph.click);

  networkGraph.links = networkGraph.links.data(githubModel.network.links, function(d) {
    return d.source.id + '-' + d.target.id;
  });
  networkGraph.links.exit().remove();
  networkGraph.links = networkGraph.links.enter().insert('line', 'g').merge(networkGraph.links);

  networkGraph.layout.nodes(githubModel.network.nodes);
  networkGraph.layout.force('link').links(githubModel.network.links);
  networkGraph.layout.alpha(1).restart();
};

d3.select(window).on('load', networkGraph.update);

networkGraph.click = function(node) {
  if (d3.event.shiftKey && node.html_url)
    return setTimeout(function() {
      open(node.html_url, '_new');
    }, 2E2);

  // TODO: "expand" data
  console.info(node);
};

// https://help.github.com/articles/search-syntax/
networkGraph.search = function(text) {
  githubModel.clear();
  networkGraph.update();
  d3.json('//api.github.com/search/repositories?q=' + text, function(error, result) {
    if (!!error) throw error;
    result.items.forEach(githubModel.repository);
    networkGraph.update();
  });
};

// doesn't work w/ d3js - why?
window.addEventListener('load', function() {
  var input = document.querySelector('[role=search]>input[type=text]');
  var timeout = null;
  input.addEventListener('keyup', function() {
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      var query = input.value.trim();
      if (query.length > 2) networkGraph.search(query);
    }, 1E3);
  });
});

d3.select(window).on('load', function() {
  d3.json('//api.github.com/events', function(error, events) {
    if (!!error) throw error;
    events.forEach(githubModel.event);
    networkGraph.update();
  });
});
